package ui

import "strings"

// small, shared text helpers

func runeLen(s string) int { return len([]rune(s)) }

func padOrEllipsis(s string, width int) string {
	r := []rune(s)
	if width <= 0 {
		return ""
	}
	if len(r) == width {
		return s
	}
	if len(r) < width {
		var b strings.Builder
		b.Grow(width)
		b.WriteString(s)
		for i := len(r); i < width; i++ {
			b.WriteByte(' ')
		}
		return b.String()
	}
	if width <= 1 {
		return string(r[:width])
	}
	return string(r[:width-1]) + "…"
}

func countLines(s string) int {
	if s == "" {
		return 0
	}
	n := strings.Count(s, "\n")
	if !strings.HasSuffix(s, "\n") {
		n++
	}
	return n
}
