package ui

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/help"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"kolosal.ai/kolosal-cli/internal/api"
)

// uiModel represents the searchable paginated list of HuggingFace models.
type uiModel struct {
	items       []api.HFModel
	seen        map[string]struct{}
	loading     bool
	loadingMore bool
	noMore      bool
	errText     string
	nextURL     string

	search        textinput.Model
	searchFocused bool
	pendingQuery  string
	appliedQuery  string

	cursor    int
	scrollTop int
	rows      int
	minRows   int
	height    int

	prefetchEdge int

	keys KeyMap
	help help.Model

	token  string
	client *http.Client

	errStyle      lipgloss.Style
	faintStyle    lipgloss.Style
	selectedStyle lipgloss.Style
	cursorGlyph   string
}

// InitialModel constructs the root model list UI state.
func InitialModel() uiModel {
	ti := textinput.New()
	ti.Prompt = "/ "
	ti.Placeholder = "search models… (Esc to clear, Enter to apply)"
	ti.CharLimit = 256
	ti.Blur()

	return uiModel{
		items:       nil,
		seen:        make(map[string]struct{}),
		loading:     true,
		loadingMore: false,
		noMore:      false,
		errText:     "",
		nextURL:     "",

		search:        ti,
		searchFocused: false,
		pendingQuery:  "",
		appliedQuery:  "",

		cursor:       0,
		scrollTop:    0,
		rows:         0,
		minRows:      8,
		prefetchEdge: 2,

		keys:   Keys,
		help:   help.New(),
		token:  os.Getenv("HF_TOKEN"),
		client: &http.Client{Timeout: 15 * time.Second},

		errStyle:      lipgloss.NewStyle().Foreground(lipgloss.Color("#ff5f5f")).Bold(true),
		faintStyle:    lipgloss.NewStyle().Faint(true),
		selectedStyle: lipgloss.NewStyle().Foreground(lipgloss.Color("#00D3A7")).Bold(true),
		cursorGlyph:   ">",
	}
}

func (m uiModel) Init() tea.Cmd {
	return fetchModelsCmd(m.client, m.token, api.BaseURL(m.appliedQuery, 20), m.appliedQuery)
}

// --- internal helpers ----------------------------------------------------

func (m *uiModel) computeRows() int {
	if m.minRows <= 0 {
		return 8
	}
	return m.minRows
}

func (m *uiModel) clampCursor() {
	if m.cursor < 0 {
		m.cursor = 0
	}
	if m.cursor > len(m.items)-1 {
		m.cursor = len(m.items) - 1
	}
	if m.cursor < 0 { // list may be empty
		m.cursor = 0
	}
}

func (m *uiModel) ensureCursorVisible() {
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

func (m *uiModel) appendDedup(newOnes []api.HFModel) {
	for _, it := range newOnes {
		if it.ModelID == "" {
			continue
		}
		if _, ok := m.seen[it.ModelID]; ok {
			continue
		}
		m.seen[it.ModelID] = struct{}{}
		m.items = append(m.items, it)
	}
}

func (m *uiModel) resetListState() {
	m.items = nil
	m.seen = make(map[string]struct{})
	m.cursor = 0
	m.scrollTop = 0
	m.noMore = false
	m.errText = ""
	m.loading = true
	m.nextURL = ""
	m.rows = m.computeRows()
}

func (m *uiModel) maybePrefetch() tea.Cmd {
	if m.loading || m.loadingMore || m.noMore || len(m.items) == 0 {
		return nil
	}
	if m.cursor >= len(m.items)-m.prefetchEdge {
		if m.nextURL == "" {
			m.noMore = true
			return nil
		}
		m.loadingMore = true
		return fetchModelsCmd(m.client, m.token, m.nextURL, m.appliedQuery)
	}
	return nil
}

// --- update loop ---------------------------------------------------------

func (m uiModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case fetchMsg:
		return m.updateFetchMsg(msg)
	case debounceMsg:
		return m.updateDebounceMsg(msg)
	case tea.WindowSizeMsg:
		m.height = msg.Height
		m.help.Width = msg.Width
		m.rows = m.computeRows()
		m.ensureCursorVisible()
		return m, nil
	case tea.KeyMsg:
		return m.updateKeyMsg(msg)
	}
	return m, nil
}

func (m uiModel) updateFetchMsg(msg fetchMsg) (tea.Model, tea.Cmd) {
	if msg.query != m.appliedQuery { // stale
		return m, nil
	}
	m.loading = false
	m.loadingMore = false
	if msg.err != nil {
		m.errText = "fetch error: " + msg.err.Error()
		m.rows = m.computeRows()
		return m, nil
	}
	m.nextURL = msg.next
	if m.nextURL == "" && len(msg.models) == 0 {
		m.noMore = true
		m.rows = m.computeRows()
		return m, nil
	}
	before := len(m.items)
	m.appendDedup(msg.models)
	if len(m.items) == before && m.nextURL == "" {
		m.noMore = true
	}
	m.errText = ""
	m.rows = m.computeRows()
	m.clampCursor()
	m.ensureCursorVisible()
	return m, nil
}

func (m uiModel) updateDebounceMsg(msg debounceMsg) (tea.Model, tea.Cmd) {
	if msg.query != m.pendingQuery { // stale
		return m, nil
	}
	m.appliedQuery = msg.query
	m.resetListState()
	return m, fetchModelsCmd(m.client, m.token, api.BaseURL(m.appliedQuery, 20), m.appliedQuery)
}

func (m uiModel) updateKeyMsg(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if m.searchFocused { // search mode
		old := m.search.Value()
		var cmd tea.Cmd
		m.search, cmd = m.search.Update(msg)
		switch {
		case key.Matches(msg, m.keys.Clear):
			m.search.SetValue("")
			m.search.Blur()
			m.searchFocused = false
			m.pendingQuery = ""
			m.appliedQuery = ""
			m.resetListState()
			return m, tea.Batch(cmd, fetchModelsCmd(m.client, m.token, api.BaseURL("", 20), ""))
		case key.Matches(msg, m.keys.Apply):
			m.pendingQuery = m.search.Value()
			m.appliedQuery = m.pendingQuery
			m.search.Blur()
			m.searchFocused = false
			m.resetListState()
			return m, tea.Batch(cmd, fetchModelsCmd(m.client, m.token, api.BaseURL(m.appliedQuery, 20), m.appliedQuery))
		case key.Matches(msg, m.keys.Down):
			m.search.Blur()
			m.searchFocused = false
			m.cursor = 0
			m.ensureCursorVisible()
			return m, nil
		}
		if m.search.Value() != old { // debounce live typing
			m.pendingQuery = m.search.Value()
			return m, tea.Batch(cmd, debounce(m.pendingQuery, 250*time.Millisecond))
		}
		return m, cmd
	}

	// list navigation mode
	switch {
	case key.Matches(msg, m.keys.Clear):
		return m, tea.Quit
	case key.Matches(msg, m.keys.Help):
		m.help.ShowAll = !m.help.ShowAll
		m.rows = m.computeRows()
		m.ensureCursorVisible()
		return m, nil
	case key.Matches(msg, m.keys.Quit):
		return m, tea.Quit
	case key.Matches(msg, m.keys.Search):
		m.searchFocused = true
		return m, m.search.Focus()
	case key.Matches(msg, m.keys.Up):
		if m.cursor == 0 {
			m.searchFocused = true
			return m, m.search.Focus()
		}
		m.cursor--
		m.clampCursor()
		m.ensureCursorVisible()
		return m, nil
	case key.Matches(msg, m.keys.Down):
		m.cursor++
		m.clampCursor()
		m.ensureCursorVisible()
		if cmd := m.maybePrefetch(); cmd != nil {
			return m, cmd
		}
		return m, nil
	case key.Matches(msg, m.keys.PgDown):
		step := m.rows
		if step <= 0 {
			step = m.minRows
		}
		m.cursor += step
		m.clampCursor()
		m.ensureCursorVisible()
		if cmd := m.maybePrefetch(); cmd != nil {
			return m, cmd
		}
		return m, nil
	case key.Matches(msg, m.keys.PgUp):
		step := m.rows
		if step <= 0 {
			step = m.minRows
		}
		m.cursor -= step
		if m.cursor <= 0 {
			m.cursor = 0
			m.searchFocused = true
			return m, m.search.Focus()
		}
		m.clampCursor()
		m.ensureCursorVisible()
		return m, nil
	case key.Matches(msg, m.keys.Home):
		m.cursor = 0
		m.ensureCursorVisible()
		m.searchFocused = true
		return m, m.search.Focus()
	case key.Matches(msg, m.keys.End):
		m.cursor = len(m.items) - 1
		if m.cursor < 0 {
			m.cursor = 0
		}
		m.ensureCursorVisible()
		if cmd := m.maybePrefetch(); cmd != nil {
			return m, cmd
		}
		return m, nil
	case key.Matches(msg, m.keys.Reload):
		m.resetListState()
		return m, fetchModelsCmd(m.client, m.token, api.BaseURL(m.appliedQuery, 20), m.appliedQuery)
	case key.Matches(msg, m.keys.Select):
		if len(m.items) == 0 {
			return m, nil
		}
		selected := m.items[m.cursor]
		newM := newFileListModel(selected.ModelID, m.token, m.client, m.keys, m.help)
		return newM, newM.Init()
	}
	return m, nil
}

// --- view -----------------------------------------------------------------

func (m uiModel) View() string {
	var b strings.Builder
	label := "Search:"
	if m.searchFocused {
		label = "Search (focused):"
	}
	b.WriteString("  " + label + "\n  " + m.search.View() + "\n\n")
	if m.errText != "" {
		b.WriteString("  " + m.errStyle.Render("Error: "+m.errText) + "\n\n")
	}
	if m.loading && len(m.items) == 0 {
		b.WriteString("  Loading…\n\n")
	}

	r := m.rows
	if r <= 0 {
		r = m.minRows
	}
	start, end := m.scrollTop, m.scrollTop+r
	if end > len(m.items) {
		end = len(m.items)
	}
	if start > end {
		start = end
	}

	if len(m.items) == 0 && !m.loading && m.errText == "" {
		msg := "No models."
		if strings.TrimSpace(m.appliedQuery) != "" {
			msg = "No results for: " + m.appliedQuery
		}
		b.WriteString("  " + msg + "\n")
		for i := 1; i < r; i++ {
			b.WriteString("\n")
		}
	} else {
		printed := 0
		for i := start; i < end && printed < r; i++ {
			line := m.items[i].ModelID
			if i == m.cursor {
				b.WriteString(fmt.Sprintf("  %s %s\n", m.cursorGlyph, m.selectedStyle.Render(line)))
			} else {
				b.WriteString(fmt.Sprintf("    %s\n", m.faintStyle.Render(line)))
			}
			printed++
		}
		for printed < r {
			b.WriteString("\n")
			printed++
		}
	}

	b.WriteString("\n")
	switch {
	case m.loadingMore:
		b.WriteString("  Fetching more…\n")
	case m.noMore:
		b.WriteString("  End of list.\n")
	default:
		b.WriteString("  \n")
	}
	b.WriteString("\n" + m.help.View(m.keys))
	return b.String()
}
