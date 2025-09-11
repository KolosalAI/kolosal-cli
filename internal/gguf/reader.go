package gguf

import (
	"fmt"
	"io"
	"net/http"

	"kolosal.ai/kolosal-cli/internal/common"
)

type RNGReader struct {
	Client   *http.Client
	Token    string
	URL      string
	buf      []byte
	bufStart int64
	pos      int64
	EOF      bool
}

func NewRNGReader(client *http.Client, token, url string) *RNGReader {
	return &RNGReader{Client: client, Token: token, URL: url, buf: make([]byte, 0), bufStart: 0, pos: 0}
}

func (rr *RNGReader) fetchRange(start, endExclusive int64) ([]byte, error) {
	if start < 0 {
		start = 0
	}
	if endExclusive <= start {
		return []byte{}, nil
	}
	req, err := http.NewRequest(http.MethodGet, rr.URL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", common.UserAgent)
	if rr.Token != "" {
		req.Header.Set("Authorization", "Bearer "+rr.Token)
	}
	req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", start, endExclusive-1))
	resp, err := rr.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusPartialContent && resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusOK && start > 0 {
		if int64(len(data)) <= start {
			return []byte{}, nil
		}
		if endExclusive > int64(len(data)) {
			endExclusive = int64(len(data))
		}
		data = data[start:endExclusive]
	}
	return data, nil
}

const bufChunk = 1 << 18 // 256KiB

func (rr *RNGReader) ensure(n int) error {
	for int64(len(rr.buf))-(rr.pos-rr.bufStart) < int64(n) {
		if rr.pos > rr.bufStart {
			offset := rr.pos - rr.bufStart
			if offset > 0 && int64(len(rr.buf)) > offset {
				copy(rr.buf, rr.buf[offset:])
				rr.buf = rr.buf[:len(rr.buf)-int(offset)]
			} else if offset >= int64(len(rr.buf)) {
				rr.buf = rr.buf[:0]
			}
			rr.bufStart = rr.pos
		}
		start := rr.bufStart + int64(len(rr.buf))
		end := start + bufChunk
		data, err := rr.fetchRange(start, end)
		if err != nil {
			return err
		}
		if len(data) == 0 {
			rr.EOF = true
			break
		}
		rr.buf = append(rr.buf, data...)
	}
	if int64(len(rr.buf))-(rr.pos-rr.bufStart) < int64(n) {
		return io.ErrUnexpectedEOF
	}
	return nil
}

func (rr *RNGReader) ReadExact(n int) ([]byte, error) {
	if n <= 0 {
		return []byte{}, nil
	}
	if err := rr.ensure(n); err != nil {
		return nil, err
	}
	start := rr.pos - rr.bufStart
	out := make([]byte, n)
	copy(out, rr.buf[start:start+int64(n)])
	rr.pos += int64(n)
	return out, nil
}

func (rr *RNGReader) SeekAbs(p int64) error {
	if p >= rr.bufStart && p <= rr.bufStart+int64(len(rr.buf)) {
		rr.pos = p
		return nil
	}
	rr.buf = rr.buf[:0]
	rr.bufStart = p
	rr.pos = p
	rr.EOF = false
	return nil
}
