package ui

import "kolosal.ai/kolosal-cli/internal/api"

// fetchMsg carries HF model list results.
type fetchMsg struct {
	models []api.HFModel
	err    error
	next   string
	query  string
}

// debounceMsg is emitted after a short delay to apply search input.
type debounceMsg struct{ query string }

// fetchFilesMsg carries the list of files for a selected model.
type fetchFilesMsg struct {
	files   []string
	err     error
	modelID string
}

// fileUsageMsg carries computed VRAM usage strings for a file.
type fileUsageMsg struct {
	modelID string
	file    string
	display string
	Quant   string // quantization type token (e.g. Q4_K_M)
	err     error
}

// spinnerTickMsg drives lightweight loading spinners.
type spinnerTickMsg struct{}

// downloadDoneMsg signals a finished download.
type downloadDoneMsg struct {
	modelID string
	file    string
	dest    string
	err     error
}

// downloadStartMsg signals the start of a (chunked) download.
type downloadStartMsg struct {
	modelID string
	file    string
	raw     string
	dest    string
	total   int64
	start   int64
	err     error
}

// downloadProgressMsg reports the progress of a chunked download.
type downloadProgressMsg struct {
	modelID string
	file    string
	wrote   int64
	err     error
}
