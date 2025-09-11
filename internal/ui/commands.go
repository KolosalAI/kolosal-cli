package ui

import (
	"time"

	"net/http"

	tea "github.com/charmbracelet/bubbletea"
	"kolosal.ai/kolosal-cli/internal/api"
)

// spinnerTick returns a periodic tick used to animate spinners.
func spinnerTick() tea.Cmd {
	return tea.Tick(120*time.Millisecond, func(time.Time) tea.Msg { return spinnerTickMsg{} })
}

// fetchModelsCmd calls the HF API to fetch models.
func fetchModelsCmd(client *http.Client, token, url, query string) tea.Cmd {
	return func() tea.Msg {
		models, next, err := api.FetchModels(client, token, url)
		return fetchMsg{models: models, next: next, err: err, query: query}
	}
}

// fetchFilesCmd fetches file names for a given model.
func fetchFilesCmd(client *http.Client, token, modelID string) tea.Cmd {
	return func() tea.Msg {
		files, err := api.FetchModelFiles(client, token, modelID)
		return fetchFilesMsg{files: files, err: err, modelID: modelID}
	}
}

// debounce returns a message after a delay to avoid excessive queries while typing.
func debounce(query string, d time.Duration) tea.Cmd {
	return tea.Tick(d, func(time.Time) tea.Msg { return debounceMsg{query: query} })
}
