package ui

import (
	"regexp"
	"strings"
)

func detectQuantFromFilename(name string) string {
	lower := strings.ToLower(name)
	if i := strings.LastIndex(lower, "."); i > 0 {
		lower = lower[:i]
	}
	patterns := []string{
		"ud-iq1_s", "ud-iq1_m", "ud-iq2_xxs", "ud-iq2_m", "ud-iq3_xxs", "ud-q2_k_xl", "ud-q3_k_xl", "ud-q4_k_xl", "ud-q5_k_xl", "ud-q6_k_xl", "ud-q8_k_xl",
		"q8_k_xl", "q6_k_xl", "q5_k_xl", "q4_k_xl", "q3_k_xl", "q2_k_xl",
		"q8_0", "q6_k", "q5_k_m", "q5_k_s", "q5_0", "iq4_nl", "iq4_xs", "q4_k_m", "q4_k_l", "q4_k_s", "q4_1", "q4_0",
		"iq3_xxs", "q3_k_l", "q3_k_m", "q3_k_s", "iq2_xxs", "iq2_m", "q2_k_l", "q2_k", "iq1_s", "iq1_m", "f16", "f32",
	}
	for _, p := range patterns {
		if strings.Contains(lower, p) {
			return strings.ToUpper(p)
		}
	}
	genericRe := regexp.MustCompile(`(?i)(iq[0-9]_[a-z]+|q[0-9]_[0-9]|q[0-9]_k_[a-z]+|q[0-9]_k)`)
	if m := genericRe.FindString(lower); m != "" {
		return strings.ToUpper(m)
	}
	return ""
}
