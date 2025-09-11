package ui

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"kolosal.ai/kolosal-cli/internal/common"
	"kolosal.ai/kolosal-cli/internal/gguf"
)

func humanMB(n int64) string {
	if n >= 1000*1000*1000 {
		return fmt.Sprintf("%.1f GB", float64(n)/1_000_000_000)
	}
	return fmt.Sprintf("%d MB", n/1_000_000)
}

func computeUsageCmd(client *http.Client, token, modelID, filename string, ctxSize int) tea.Cmd {
	return func() tea.Msg {
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
		raw := fmt.Sprintf("https://huggingface.co/%s/resolve/main/%s", pathModel, pathFile)

		size, err := getRemoteSize(client, token, raw)
		if err != nil || size <= 0 {
			return fileUsageMsg{modelID: modelID, file: filename, err: fmt.Errorf("size error: %v", err)}
		}
		modelMB := int64(size / 1_000_000)
		rr := gguf.NewRNGReader(client, token, raw)
		params, err := gguf.ParseParams(rr)
		if err != nil {
			return fileUsageMsg{modelID: modelID, file: filename, err: err}
		}
		quant := detectQuantFromFilename(filename)
		if quant == "" {
			rr2 := gguf.NewRNGReader(client, token, raw)
			if q, qerr := gguf.ExtractFileType(rr2); qerr == nil && q != "" {
				quant = q
			}
		}
		kvBytes := 4.0 * float64(params.HiddenSize) * float64(params.HiddenLayers) * float64(ctxSize)
		kvMB := int64(kvBytes / 1_000_000.0)
		totalMB := modelMB + kvMB
		display := fmt.Sprintf("%s (Model: %s + KV: %s)", humanMB(totalMB*1_000_000), humanMB(modelMB*1_000_000), humanMB(kvMB*1_000_000))
		return fileUsageMsg{modelID: modelID, file: filename, display: display, Quant: quant}
	}
}

// getRemoteSize determines the remote file size using HEAD or range GET.
func getRemoteSize(client *http.Client, token, urlStr string) (int64, error) {
	resp, err := doRequest(client, token, http.MethodHead, urlStr, "")
	if err == nil && resp != nil {
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			if v, ok := headContentLength(resp); ok {
				resp.Body.Close()
				return v, nil
			}
		}
		resp.Body.Close()
	}
	resp2, err := doRequest(client, token, http.MethodGet, urlStr, "bytes=0-0")
	if err != nil {
		return 0, err
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusPartialContent && resp2.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("HTTP %d", resp2.StatusCode)
	}
	if cr := resp2.Header.Get("Content-Range"); cr != "" {
		if i := strings.LastIndex(cr, "/"); i >= 0 && i+1 < len(cr) {
			if v, err := parseInt64(cr[i+1:]); err == nil && v > 0 {
				return v, nil
			}
		}
	}
	if v, ok := headContentLength(resp2); ok {
		return v, nil
	}
	return 0, nil
}

func doRequest(client *http.Client, token, method, urlStr, rangeHdr string) (*http.Response, error) {
	req, _ := http.NewRequest(method, urlStr, nil)
	req.Header.Set("User-Agent", common.UserAgent)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if rangeHdr != "" {
		req.Header.Set("Range", rangeHdr)
	}
	return client.Do(req)
}
