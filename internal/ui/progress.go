package ui

import (
	"fmt"
	"os"
	"strings"
)

func renderProgress(width int, pct float64, received, total int64) string {
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
	bytesSuffix := ""
	if total > 0 && received >= 0 && received <= total {
		bytesSuffix = " " + humanSize(received, true) + "/" + humanSize(total, true)
	}
	const minBar = 6
	barWidth := width - 1 - 1 - len(percStr) // '[' + ']' + space + percent
	if bytesSuffix != "" {
		barWidth = barWidth - len(bytesSuffix)
	}
	if barWidth < minBar {
		if bytesSuffix != "" {
			shortSuffix := " " + humanSize(received, false) + "/" + humanSize(total, false)
			bw2 := width - 1 - 1 - len(percStr) - len(shortSuffix)
			if bw2 >= minBar {
				bytesSuffix = shortSuffix
				barWidth = bw2
			} else {
				bytesSuffix = ""
				barWidth = width - 1 - 1 - len(percStr)
			}
		} else {
			if barWidth < minBar {
				barWidth = minBar
			}
		}
	}
	minTotal := 1 + minBar + 1 + len(percStr) // original minimal
	if width < minTotal {                     // can't fit bar & percent; show percent tail-aligned
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
	b.Grow(1 + barWidth + 1 + 1 + len(percStr) + len(bytesSuffix))
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
	if bytesSuffix != "" {
		b.WriteString(bytesSuffix)
	}
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

func humanSize(n int64, detailed bool) string {
	if n < 0 {
		return "0B"
	}
	const unit = 1024.0
	f := float64(n)
	units := []string{"B", "KB", "MB", "GB", "TB", "PB"}
	i := 0
	for f >= unit && i < len(units)-1 {
		f /= unit
		i++
	}
	if i == 0 { // bytes, no decimal
		return fmt.Sprintf("%d%s", int64(f), units[i])
	}
	if detailed {
		return fmt.Sprintf("%.1f%s", f, units[i])
	}
	return fmt.Sprintf("%d%s", int64(f+0.5), units[i])
}
