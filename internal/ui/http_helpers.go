package ui

import (
	"net/http"
	"strconv"
)

// headContentLength extracts Content-Length if present and > 0.
func headContentLength(resp *http.Response) (int64, bool) {
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		if v, err := strconv.ParseInt(cl, 10, 64); err == nil && v > 0 {
			return v, true
		}
	}
	return 0, false
}

func parseInt64(s string) (int64, error) { return strconv.ParseInt(s, 10, 64) }
