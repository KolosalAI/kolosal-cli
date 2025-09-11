package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"

	"kolosal.ai/kolosal-cli/internal/ui"
)

func main() {
	p := tea.NewProgram(ui.InitialModel())
	if _, err := p.Run(); err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}
}
