package common

import (
	"bytes"
	"io"
	"net/http"
)

const UserAgent = "hf-bubbletea-cli/1.0 (+https://example.local)"

func ReadBodySnippet(r io.Reader, n int) string {
	if r == nil {
		return ""
	}
	var buf bytes.Buffer
	_, _ = io.CopyN(&buf, r, int64(n))
	return buf.String()
}

func SetStdHeaders(req *http.Request, token string) {
	req.Header.Set("User-Agent", UserAgent)
	req.Header.Set("Accept", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
}
