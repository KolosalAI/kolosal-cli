package ui

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/charmbracelet/bubbles/help"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type fileListModel struct {
	modelID   string
	files     []string
	loading   bool
	errText   string
	infoText  string
	cursor    int
	scrollTop int
	rows      int
	minRows   int
	height    int
	width     int

	keys KeyMap
	help help.Model

	token  string
	client *http.Client

	titleStyle    lipgloss.Style
	errStyle      lipgloss.Style
	infoStyle     lipgloss.Style
	faintStyle    lipgloss.Style
	selectedStyle lipgloss.Style
	cursorGlyph   string

	usages        map[string]*usageStatus
	downloaded    map[string]bool
	downloads     map[string]*dlState
	spinnerFrames []string
	spinnerIdx    int
	ctxSize       int

	dlChunk int64 // download chunk size
}

type usageStatus struct {
	loading      bool
	display, err string
	quant        string
}

type dlState struct {
	url, dest       string
	total, received int64
	active          bool
}

func newFileListModel(modelID, token string, client *http.Client, keys KeyMap, h help.Model) fileListModel {
	return fileListModel{
		modelID:       modelID,
		loading:       true,
		minRows:       8,
		keys:          keys,
		help:          h,
		token:         token,
		client:        client,
		titleStyle:    lipgloss.NewStyle().Bold(true),
		errStyle:      lipgloss.NewStyle().Foreground(lipgloss.Color("#ff5f5f")).Bold(true),
		infoStyle:     lipgloss.NewStyle().Foreground(lipgloss.Color("#00D3A7")).Bold(true),
		faintStyle:    lipgloss.NewStyle().Faint(true),
		selectedStyle: lipgloss.NewStyle().Foreground(lipgloss.Color("#00D3A7")).Bold(true),
		cursorGlyph:   ">",
		usages:        make(map[string]*usageStatus),
		downloaded:    make(map[string]bool),
		spinnerFrames: spinner.Pulse.Frames,
		ctxSize:       4096,
		downloads:     make(map[string]*dlState),
		dlChunk:       int64(4 << 20),
	}
}

func (m fileListModel) Init() tea.Cmd { return fetchFilesCmd(m.client, m.token, m.modelID) }

func (m fileListModel) anyLoading() bool {
	for _, f := range m.files {
		if st, ok := m.usages[f]; ok && st.loading {
			return true
		}
	}
	return false
}

func (m fileListModel) quantDisplay(name string) string {
	st, ok := m.usages[name]
	if !ok || st.loading {
		frame := m.spinnerFrames[m.spinnerIdx%len(m.spinnerFrames)]
		return frame + ""
	}
	if st.err != "" {
		return "Err"
	}
	if st.quant != "" {
		return st.quant
	}
	return "?"
}

func (m fileListModel) memoryDisplay(name string) string {
	st, ok := m.usages[name]
	if !ok || st.loading {
		frame := m.spinnerFrames[m.spinnerIdx%len(m.spinnerFrames)]
		return frame + " Loading"
	}
	if st.err != "" {
		return "Error"
	}
	if st.display != "" && st.display != "Error" {
		return st.display
	}
	return "-"
}

func (m *fileListModel) computeRows() int {
	if m.height <= 0 {
		if m.rows > 0 {
			return m.rows
		}
		return m.minRows
	}
	header := 2
	if m.errText != "" {
		header += 2
	} else if m.loading {
		header += 2
	}
	helpLines := countLines(m.help.View(Keys))
	footer := 1 + helpLines
	usable := m.height - header - footer
	if usable < m.minRows {
		usable = m.minRows
	}
	return usable
}

func (m *fileListModel) ensureVisible() {
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

func (m fileListModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case fetchFilesMsg:
		return m.handleFetchFiles(msg)
	case fileUsageMsg:
		return m.handleFileUsage(msg)
	case spinnerTickMsg:
		if !m.anyLoading() {
			return m, nil
		}
		m.spinnerIdx = (m.spinnerIdx + 1) % len(m.spinnerFrames)
		return m, spinnerTick()
	case downloadStartMsg:
		return m.handleDownloadStart(msg)
	case downloadProgressMsg:
		return m.handleDownloadProgress(msg)
	case downloadDoneMsg:
		return m.handleDownloadDone(msg)
	case tea.WindowSizeMsg:
		m.height = msg.Height
		m.help.Width = msg.Width
		m.width = msg.Width
		m.rows = m.computeRows()
		m.ensureVisible()
		return m, nil
	case tea.KeyMsg:
		return m.handleKey(msg)
	}
	return m, nil
}

func (m fileListModel) handleFetchFiles(msg fetchFilesMsg) (tea.Model, tea.Cmd) {
	if msg.modelID != m.modelID {
		return m, nil
	}
	m.loading = false
	if msg.err != nil {
		m.errText = "fetch error: " + msg.err.Error()
		return m, nil
	}
	m.files = msg.files
	cmds := make([]tea.Cmd, 0, len(m.files)+1)
	for _, f := range m.files {
		m.usages[f] = &usageStatus{loading: true}
		cmds = append(cmds, computeUsageCmd(m.client, m.token, m.modelID, f, m.ctxSize))
		if dest, err := localModelPath(m.modelID, f); err == nil {
			if _, statErr := os.Stat(dest); statErr == nil {
				m.downloaded[f] = true
			} else {
				m.downloaded[f] = false
			}
		}
	}
	if len(m.files) > 0 {
		cmds = append(cmds, spinnerTick())
	}
	return m, tea.Batch(cmds...)
}

func (m fileListModel) handleFileUsage(msg fileUsageMsg) (tea.Model, tea.Cmd) {
	if msg.modelID != m.modelID {
		return m, nil
	}
	if st, ok := m.usages[msg.file]; ok {
		st.loading = false
		st.err = ""
		if msg.err != nil {
			st.err = msg.err.Error()
			st.display = "Error"
		} else {
			st.display = msg.display
			st.quant = msg.Quant
		}
	}
	if m.anyLoading() {
		return m, spinnerTick()
	}
	return m, nil
}

func (m fileListModel) handleDownloadStart(msg downloadStartMsg) (tea.Model, tea.Cmd) {
	if msg.modelID != m.modelID {
		return m, nil
	}
	if msg.err != nil {
		m.errText = "download start error: " + msg.err.Error()
		return m, nil
	}
	m.downloads[msg.file] = &dlState{url: msg.raw, dest: msg.dest, total: msg.total, received: msg.start, active: true}
	start, end := msg.start, msg.start+m.dlChunk
	if end > msg.total {
		end = msg.total
	}
	return m, downloadChunkCmd(m.client, m.token, m.modelID, msg.file, msg.raw, msg.dest, start, end)
}

func (m fileListModel) handleDownloadProgress(msg downloadProgressMsg) (tea.Model, tea.Cmd) {
	if msg.modelID != m.modelID {
		return m, nil
	}
	st, ok := m.downloads[msg.file]
	if !ok || !st.active {
		return m, nil
	}
	if msg.err != nil {
		m.errText = "download error: " + msg.err.Error()
		st.active = false
		return m, nil
	}
	st.received += msg.wrote
	if st.total > 0 && st.received >= st.total {
		st.active = false
		m.downloaded[msg.file] = true
		m.infoText = "Downloaded: " + st.dest
		return m, nil
	}
	start := st.received
	end := start + m.dlChunk
	if st.total > 0 && end > st.total {
		end = st.total
	}
	return m, downloadChunkCmd(m.client, m.token, m.modelID, msg.file, st.url, st.dest, start, end)
}

func (m fileListModel) handleDownloadDone(msg downloadDoneMsg) (tea.Model, tea.Cmd) {
	if msg.modelID != m.modelID {
		return m, nil
	}
	if msg.err != nil {
		m.errText = "download error: " + msg.err.Error()
		m.infoText = ""
		return m, nil
	}
	m.errText = ""
	m.infoText = "Downloaded: " + msg.dest
	m.downloaded[msg.file] = true
	if st, ok := m.downloads[msg.file]; ok {
		st.active = false
		st.received = st.total
	}
	return m, nil
}

func (m fileListModel) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch {
	case key.Matches(msg, m.keys.Clear):
		root := InitialModel()
		return root, root.Init()
	case key.Matches(msg, m.keys.Help):
		m.help.ShowAll = !m.help.ShowAll
		m.rows = m.computeRows()
		m.ensureVisible()
		return m, nil
	case key.Matches(msg, m.keys.Quit):
		return m, tea.Quit
	case key.Matches(msg, m.keys.Back):
		root := InitialModel()
		return root, root.Init()
	case key.Matches(msg, m.keys.Up):
		m.cursor--
		if m.cursor < 0 {
			m.cursor = 0
		}
		m.ensureVisible()
		return m, nil
	case key.Matches(msg, m.keys.Down):
		if len(m.files) > 0 && m.cursor < len(m.files)-1 {
			m.cursor++
		}
		m.ensureVisible()
		return m, nil
	case key.Matches(msg, m.keys.PgDown):
		step := m.rows
		if step <= 0 {
			step = m.minRows
		}
		m.cursor += step
		if m.cursor > len(m.files)-1 {
			m.cursor = len(m.files) - 1
		}
		if m.cursor < 0 {
			m.cursor = 0
		}
		m.ensureVisible()
		return m, nil
	case key.Matches(msg, m.keys.PgUp):
		step := m.rows
		if step <= 0 {
			step = m.minRows
		}
		m.cursor -= step
		if m.cursor < 0 {
			m.cursor = 0
		}
		m.ensureVisible()
		return m, nil
	case key.Matches(msg, m.keys.Home):
		m.cursor = 0
		m.ensureVisible()
		return m, nil
	case key.Matches(msg, m.keys.End):
		m.cursor = len(m.files) - 1
		if m.cursor < 0 {
			m.cursor = 0
		}
		m.ensureVisible()
		return m, nil
	case key.Matches(msg, m.keys.Select):
		if len(m.files) == 0 {
			return m, nil
		}
		name := m.files[m.cursor]
		if m.downloaded[name] {
			settings := newSettingsModel(m.modelID, name, m.token, m.client, m.keys, m.help)
			return settings, settings.Init()
		}
		if st, ok := m.downloads[name]; ok && st.active {
			return m, nil
		}
		m.infoText = "Downloading…"
		return m, startDownloadCmd(m.client, m.token, m.modelID, name)
	}
	return m, nil
}

// view

func (m fileListModel) View() string {
	var b strings.Builder
	title := m.titleStyle.Render("Model: " + m.modelID + " — .gguf files")
	b.WriteString("  " + title + "\n\n")
	if m.errText != "" {
		b.WriteString("  " + m.errStyle.Render("Error: "+m.errText) + "\n\n")
	}
	if m.infoText != "" {
		b.WriteString("  " + m.infoStyle.Render(m.infoText) + "\n\n")
	}
	if m.loading {
		b.WriteString("  Loading…\n\n")
	}
	r := m.rows
	if r <= 0 {
		r = m.minRows
	}
	start, end := m.scrollTop, m.scrollTop+r
	if end > len(m.files) {
		end = len(m.files)
	}
	if start > end {
		start = end
	}
	if len(m.files) == 0 && !m.loading && m.errText == "" {
		b.WriteString("  No .gguf files.\n")
	} else {
		avail := m.width - 4
		if avail < 32 {
			avail = 32
		}
		quantStrs := make([]string, 0, end-start)
		memStrs := make([]string, 0, end-start)
		maxQuant := 0
		maxMem := 0
		anyDownloaded := false
		anyInProgress := false
		for i := start; i < end; i++ {
			name := m.files[i]
			q := m.quantDisplay(name)
			quantStrs = append(quantStrs, q)
			if l := runeLen(q); l > maxQuant {
				maxQuant = l
			}
			mem := m.memoryDisplay(name)
			memStrs = append(memStrs, mem)
			if l := runeLen(mem); l > maxMem {
				maxMem = l
			}
			if m.downloaded[name] {
				anyDownloaded = true
			}
			if st, ok := m.downloads[name]; ok && st.active {
				anyInProgress = true
			}
		}
		quantCol := maxQuant
		if quantCol < 6 {
			quantCol = 6
		}
		if quantCol > 16 {
			quantCol = 16
		}
		memCol := maxMem
		if memCol < 24 {
			memCol = 24
		}
		if memCol > 64 {
			memCol = 64
		}
		dlCol := 0
		if anyDownloaded || anyInProgress {
			dlCol = avail / 3
			minBar := len("[##########] 100%")
			if dlCol < minBar {
				dlCol = minBar
			}
			if dlCol < 26 {
				dlCol = 26
			}
			if dlCol > 56 {
				dlCol = 56
			}
		}
		seps := 5 // name — quant · mem
		if dlCol > 0 {
			seps += 2
		}
		nameCol := avail - quantCol - memCol - dlCol - seps
		if nameCol < 24 {
			nameCol = 24
		}
		printed := 0
		for i := start; i < end && printed < r; i++ {
			name := m.files[i]
			left := padOrEllipsis(name, nameCol)
			q := padOrEllipsis(quantStrs[i-start], quantCol)
			mem := padOrEllipsis(memStrs[i-start], memCol)
			dl := ""
			if m.downloaded[name] {
				dl = padOrEllipsis("downloaded", dlCol)
			} else if st, ok := m.downloads[name]; ok && st.active && st.total > 0 {
				pctf := float64(st.received) / float64(st.total)
				if pctf < 0 {
					pctf = 0
				}
				if pctf > 1 {
					pctf = 1
				}
				dl = renderProgress(dlCol, pctf, st.received, st.total)
			}
			line := left + " — " + q + "  " + mem
			if dlCol > 0 {
				if dl != "" {
					line += "  " + dl
				} else {
					line += "  " + padOrEllipsis("", dlCol)
				}
			}
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
	b.WriteString("\n" + m.help.View(m.keys))
	return b.String()
}
