package ui

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/charmbracelet/bubbles/help"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// settingsModel shows editable inference parameters for a downloaded model file.
type settingsModel struct {
	modelID  string
	fileName string
	token    string
	client   *http.Client

	order  []string
	values map[string]string

	cursor    int
	scrollTop int
	rows      int
	minRows   int
	height    int

	editing   bool
	editField string
	input     textinput.Model

	keys KeyMap
	help help.Model

	titleStyle    lipgloss.Style
	selectedStyle lipgloss.Style
	faintStyle    lipgloss.Style
	errStyle      lipgloss.Style
	cursorGlyph   string
}

func newSettingsModel(modelID, fileName, token string, client *http.Client, keys KeyMap, h help.Model) settingsModel {
	ti := textinput.New()
	ti.CharLimit = 32
	ti.Prompt = "> "
	ti.Blur()
	order := []string{"n_ctx", "n_keep", "use_mmap", "use_mlock", "n_parallel", "cont_batching", "warmup", "n_gpu_layers", "n_batch", "n_ubatch"}
	vals := map[string]string{
		"n_ctx":         "2048",
		"n_keep":        "1024",
		"use_mmap":      "true",
		"use_mlock":     "false",
		"n_parallel":    "1",
		"cont_batching": "true",
		"warmup":        "false",
		"n_gpu_layers":  "100",
		"n_batch":       "2048",
		"n_ubatch":      "512",
	}
	return settingsModel{
		modelID:       modelID,
		fileName:      fileName,
		token:         token,
		client:        client,
		order:         order,
		values:        vals,
		cursor:        0,
		scrollTop:     0,
		rows:          0,
		minRows:       8,
		editing:       false,
		editField:     "",
		input:         ti,
		keys:          keys,
		help:          h,
		titleStyle:    lipgloss.NewStyle().Bold(true),
		selectedStyle: lipgloss.NewStyle().Foreground(lipgloss.Color("#00D3A7")).Bold(true),
		faintStyle:    lipgloss.NewStyle().Faint(true),
		errStyle:      lipgloss.NewStyle().Foreground(lipgloss.Color("#ff5f5f")).Bold(true),
		cursorGlyph:   ">",
	}
}

func (m settingsModel) Init() tea.Cmd { return nil }

// helpers
func (m *settingsModel) computeRows() int {
	if m.height <= 0 {
		if m.rows > 0 {
			return m.rows
		}
		return m.minRows
	}
	header := 2
	helpLines := countLines(m.help.View(Keys))
	footer := 1 + helpLines
	usable := m.height - header - footer
	if usable < m.minRows {
		usable = m.minRows
	}
	return usable
}

func (m *settingsModel) ensureVisible() {
	r := m.rows
	if r <= 0 {
		r = m.minRows
	}
	if m.cursor < m.scrollTop {
		m.scrollTop = m.cursor
	}
	if m.cursor >= m.scrollTop+r {
		m.scrollTop = m.cursor - (r - 1)
	}
	if m.scrollTop < 0 {
		m.scrollTop = 0
	}
}

// update
func (m settingsModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.height = msg.Height
		m.help.Width = msg.Width
		m.rows = m.computeRows()
		m.ensureVisible()
		return m, nil
	case tea.KeyMsg:
		if m.editing {
			return m.updateEditingKey(msg)
		}
		return m.updateNavKey(msg)
	}
	return m, nil
}

func (m settingsModel) updateEditingKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch {
	case key.Matches(msg, m.keys.Apply):
		m.values[m.editField] = m.input.Value()
		m.editing = false
		m.editField = ""
		m.input.Blur()
		return m, nil
	case key.Matches(msg, m.keys.Clear):
		m.editing = false
		m.editField = ""
		m.input.Blur()
		return m, nil
	}
	var cmd tea.Cmd
	m.input, cmd = m.input.Update(msg)
	return m, cmd
}

func (m settingsModel) updateNavKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch {
	case key.Matches(msg, m.keys.Clear), key.Matches(msg, m.keys.Back):
		fl := newFileListModel(m.modelID, m.token, m.client, m.keys, m.help)
		return fl, fl.Init()
	case key.Matches(msg, m.keys.Help):
		m.help.ShowAll = !m.help.ShowAll
		m.rows = m.computeRows()
		m.ensureVisible()
		return m, nil
	case key.Matches(msg, m.keys.Quit):
		return m, tea.Quit
	case key.Matches(msg, m.keys.Up):
		m.cursor--
		if m.cursor < 0 {
			m.cursor = 0
		}
		m.ensureVisible()
		return m, nil
	case key.Matches(msg, m.keys.Down):
		if m.cursor < len(m.order)-1 {
			m.cursor++
		}
		m.ensureVisible()
		return m, nil
	case key.Matches(msg, m.keys.Home):
		m.cursor = 0
		m.ensureVisible()
		return m, nil
	case key.Matches(msg, m.keys.End):
		m.cursor = len(m.order) - 1
		if m.cursor < 0 {
			m.cursor = 0
		}
		m.ensureVisible()
		return m, nil
	case key.Matches(msg, m.keys.Select), key.Matches(msg, m.keys.Apply):
		if len(m.order) == 0 {
			return m, nil
		}
		field := m.order[m.cursor]
		m.editing = true
		m.editField = field
		m.input.SetValue(m.values[field])
		return m, m.input.Focus()
	}
	return m, nil
}

// view
func (m settingsModel) View() string {
	var b strings.Builder
	title := fmt.Sprintf("Settings for %s / %s", m.modelID, m.fileName)
	b.WriteString("  " + m.titleStyle.Render(title) + "\n\n")
	r := m.rows
	if r <= 0 {
		r = m.minRows
	}
	start, end := m.scrollTop, m.scrollTop+r
	if end > len(m.order) {
		end = len(m.order)
	}
	if start > end {
		start = end
	}
	maxName := 1
	for _, n := range m.order {
		if l := runeLen(n); l > maxName {
			maxName = l
		}
	}
	maxVal := 0
	for _, n := range m.order {
		v := m.values[n]
		if m.editing && m.editField == n {
			v = m.input.View()
		}
		if l := runeLen(v); l > maxVal {
			maxVal = l
		}
	}
	tooltipText := "press enter to modify"
	tooltipWidth := runeLen(tooltipText)
	printed := 0
	for i := start; i < end && printed < r; i++ {
		name := m.order[i]
		val := m.values[name]
		if m.editing && m.editField == name {
			val = m.input.View()
		}
		padName := name + strings.Repeat(" ", maxName-runeLen(name))
		padVal := val + strings.Repeat(" ", maxVal-runeLen(val))
		mainLine := fmt.Sprintf("%s  %s", padName, padVal)
		if i == m.cursor {
			tooltip := m.faintStyle.Render(tooltipText)
			b.WriteString(fmt.Sprintf("  %s %s  %s\n", m.cursorGlyph, m.selectedStyle.Render(mainLine), tooltip))
		} else {
			blank := strings.Repeat(" ", tooltipWidth)
			b.WriteString(fmt.Sprintf("    %s  %s\n", m.faintStyle.Render(mainLine), blank))
		}
		printed++
	}
	for printed < r {
		b.WriteString("\n")
		printed++
	}
	b.WriteString("\n" + m.help.View(m.keys))
	return b.String()
}
