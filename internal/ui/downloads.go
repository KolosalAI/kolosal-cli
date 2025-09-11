package ui

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"kolosal.ai/kolosal-cli/internal/common"
)

// buildRawURL builds a HuggingFace raw URL for the model/file
func buildRawURL(modelID, filename string) string {
	parts := strings.Split(modelID, "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	pathModel := strings.Join(parts, "/")
	fnameParts := strings.Split(filename, "/")
	for i := range fnameParts {
		fnameParts[i] = url.PathEscape(fnameParts[i])
	}
	pathFile := strings.Join(fnameParts, "/")
	return fmt.Sprintf("https://huggingface.co/%s/resolve/main/%s", pathModel, pathFile)
}

// startDownloadCmd fetches size, prepares dest, and kicks off the first chunk
func startDownloadCmd(client *http.Client, token, modelID, filename string) tea.Cmd {
	return func() tea.Msg {
		raw := buildRawURL(modelID, filename)
		// Resolve dest
		dest, err := localModelPath(modelID, filename)
		if err != nil {
			return downloadStartMsg{modelID: modelID, file: filename, err: err}
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			return downloadStartMsg{modelID: modelID, file: filename, err: err}
		}
		// If exists, report done immediately
		if _, statErr := os.Stat(dest); statErr == nil {
			return downloadDoneMsg{modelID: modelID, file: filename, dest: dest, err: nil}
		}
		// Get total size
		size, err := getRemoteSize(client, token, raw)
		if err != nil || size <= 0 {
			return downloadStartMsg{modelID: modelID, file: filename, err: fmt.Errorf("cannot determine size: %v", err)}
		}
		// Create file (truncate)
		f, err := os.Create(dest)
		if err != nil {
			return downloadStartMsg{modelID: modelID, file: filename, err: err}
		}
		f.Close()
		return downloadStartMsg{modelID: modelID, file: filename, raw: raw, dest: dest, total: size, start: 0, err: nil}
	}
}

// downloadChunkCmd downloads a chunk starting at 'start' up to 'end-1' and writes it to dest.
func downloadChunkCmd(client *http.Client, token, modelID, filename, raw, dest string, start, end int64) tea.Cmd {
	return func() tea.Msg {
		req, err := http.NewRequest(http.MethodGet, raw, nil)
		if err != nil {
			return downloadProgressMsg{modelID: modelID, file: filename, wrote: 0, err: err}
		}
		req.Header.Set("User-Agent", common.UserAgent)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if end > 0 {
			req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", start, end-1))
		} else {
			req.Header.Set("Range", fmt.Sprintf("bytes=%d-", start))
		}
		resp, err := client.Do(req)
		if err != nil {
			return downloadProgressMsg{modelID: modelID, file: filename, wrote: 0, err: err}
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusPartialContent && resp.StatusCode != http.StatusOK {
			body := common.ReadBodySnippet(resp.Body, 300)
			return downloadProgressMsg{modelID: modelID, file: filename, wrote: 0, err: fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(body))}
		}
		// Open dest for writing at position
		f, err := os.OpenFile(dest, os.O_WRONLY, 0o644)
		if err != nil {
			return downloadProgressMsg{modelID: modelID, file: filename, wrote: 0, err: err}
		}
		defer f.Close()
		if _, err := f.Seek(start, 0); err != nil {
			return downloadProgressMsg{modelID: modelID, file: filename, wrote: 0, err: err}
		}
		n, err := io.Copy(f, resp.Body)
		if err != nil {
			return downloadProgressMsg{modelID: modelID, file: filename, wrote: 0, err: err}
		}
		return downloadProgressMsg{modelID: modelID, file: filename, wrote: n, err: nil}
	}
}

// localModelPath returns $HOME/.kolosal/<modelID segments>/<basename(filename)>
func localModelPath(modelID, filename string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(home) == "" {
		if h := os.Getenv("HOME"); h != "" {
			home = h
		}
	}
	if strings.TrimSpace(home) == "" {
		return "", fmt.Errorf("cannot resolve home directory")
	}
	base := filepath.Join(home, ".kolosal")
	p := base
	for _, seg := range strings.Split(modelID, "/") {
		if seg = strings.TrimSpace(seg); seg != "" {
			p = filepath.Join(p, seg)
		}
	}
	return filepath.Join(p, filepath.Base(filename)), nil
}
