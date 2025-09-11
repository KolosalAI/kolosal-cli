package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"kolosal.ai/kolosal-cli/internal/common"
)

type HFModel struct {
	ModelID string `json:"modelId"`
}

type HFSibling struct {
	RFilename string `json:"rfilename"`
}

type HFModelDetail struct {
	Siblings []HFSibling `json:"siblings"`
}

func BaseURL(query string, limit int) string {
	base := "https://huggingface.co/api/models"
	v := url.Values{}
	v.Add("filter", "text-generation")
	v.Add("filter", "gguf")
	v.Set("sort", "trendingScore")
	v.Set("full", "false")
	v.Set("config", "false")
	v.Set("limit", strconv.Itoa(limit))
	if strings.TrimSpace(query) != "" {
		v.Set("search", query)
	}
	return base + "?" + v.Encode()
}

func ParseLinkNext(h string) string {
	if h == "" {
		return ""
	}
	parts := strings.Split(h, ",")
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if !strings.Contains(p, `rel="next"`) {
			continue
		}
		l := strings.Index(p, "<")
		r := strings.Index(p, ">")
		if l >= 0 && r > l+1 {
			return p[l+1 : r]
		}
	}
	return ""
}

func FetchModels(client *http.Client, token, urlOrBase string) ([]HFModel, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, urlOrBase, nil)
	if err != nil {
		return nil, "", err
	}
	common.SetStdHeaders(req, token)

	res, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		body := common.ReadBodySnippet(res.Body, 300)
		return nil, "", fmt.Errorf("HTTP %d: %s", res.StatusCode, strings.TrimSpace(body))
	}
	var models []HFModel
	if err := json.NewDecoder(res.Body).Decode(&models); err != nil {
		return nil, "", err
	}
	next := ParseLinkNext(res.Header.Get("Link"))
	return models, next, nil
}

func FetchModelFiles(client *http.Client, token, modelID string) ([]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	parts := strings.Split(modelID, "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	modelPath := strings.Join(parts, "/")
	u := "https://huggingface.co/api/models/" + modelPath + "?expand[]=siblings&full=false&config=false"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	common.SetStdHeaders(req, token)

	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		body := common.ReadBodySnippet(res.Body, 300)
		return nil, fmt.Errorf("HTTP %d: %s", res.StatusCode, strings.TrimSpace(body))
	}
	var detail HFModelDetail
	if err := json.NewDecoder(res.Body).Decode(&detail); err != nil {
		return nil, err
	}
	var files []string
	for _, s := range detail.Siblings {
		if strings.HasSuffix(strings.ToLower(s.RFilename), ".gguf") {
			files = append(files, s.RFilename)
		}
	}
	return files, nil
}
