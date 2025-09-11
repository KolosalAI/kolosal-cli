package ui

import (
	"fmt"
	"os"
	"strings"
)

// renderProgress renders an ASCII/Unicode progress bar within width.
func renderProgress(width int, pct float64) string {
	if width <= 0 {
		return ""
	}
	if pct < 0 {
		pct = 0
	}
	if pct > 1 {
		pct = 1
	}
	percent := int(pct * 100)
	percStr := fmt.Sprintf("%3d%%", percent)
	const minBar = 6
	minTotal := 1 + minBar + 1 + len(percStr)
	if width < minTotal {
		if width < len(percStr) {
			r := []rune(percStr)
			if width <= 0 {
				return ""
			}
			return string(r[len(r)-width:])
		}
		pad := width - len(percStr)
		if pad < 0 {
			pad = 0
		}
		return strings.Repeat(" ", pad) + percStr
	}
	barWidth := width - 1 - len(percStr) - 1
	if barWidth < minBar {
		barWidth = minBar
	}
	filled := int(float64(barWidth) * pct)
	if filled < 0 {
		filled = 0
	}
	if filled > barWidth {
		filled = barWidth
	}
	var b strings.Builder
	b.Grow(1 + barWidth + 1 + len(percStr))
	b.WriteByte('[')
	full := "█"
	empty := "░"
	if !supportsUnicode() {
		full = "#"
		empty = "-"
	}
	if filled > 0 {
		b.WriteString(strings.Repeat(full, filled))
	}
	if barWidth-filled > 0 {
		b.WriteString(strings.Repeat(empty, barWidth-filled))
	}
	b.WriteByte(']')
	b.WriteByte(' ')
	b.WriteString(percStr)
	out := b.String()
	rl := len([]rune(out))
	if rl == width {
		return out
	}
	if rl < width {
		return out + strings.Repeat(" ", width-rl)
	}
	r := []rune(out)
	return string(r[:width])
}

// supportsUnicode heuristically checks for a UTF-8 locale.
func supportsUnicode() bool {
	for _, k := range []string{"LC_ALL", "LC_CTYPE", "LANG"} {
		v := os.Getenv(k)
		if v == "" {
			continue
		}
		vUp := strings.ToUpper(v)
		if strings.Contains(vUp, "UTF-8") || strings.Contains(vUp, "UTF8") {
			return true
		}
	}
	return true
}
