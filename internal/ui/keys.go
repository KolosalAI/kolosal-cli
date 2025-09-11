package ui

import (
	"github.com/charmbracelet/bubbles/key"
)

type KeyMap struct {
	Up     key.Binding
	Down   key.Binding
	PgUp   key.Binding
	PgDown key.Binding
	Home   key.Binding
	End    key.Binding
	Search key.Binding
	Apply  key.Binding
	Clear  key.Binding
	Reload key.Binding
	Help   key.Binding
	Select key.Binding
	Quit   key.Binding
	Back   key.Binding
}

func (k KeyMap) ShortHelp() []key.Binding {
	return []key.Binding{k.Search, k.Help, k.Quit}
}
func (k KeyMap) FullHelp() [][]key.Binding {
	return [][]key.Binding{
		{k.Up, k.Down, k.PgUp, k.PgDown, k.Home, k.End},
		{k.Search, k.Apply, k.CLEAR(), k.Back},
		{k.Select, k.Reload},
		{k.Help, k.Quit},
	}
}
func (k KeyMap) CLEAR() key.Binding { return k.Clear }

var Keys = KeyMap{
	Up: key.NewBinding(
		key.WithKeys("up", "k"),
		key.WithHelp("↑/k", "move up / focus search at top"),
	),
	Down: key.NewBinding(
		key.WithKeys("down", "j"),
		key.WithHelp("↓/j", "move down / from search to list"),
	),
	PgUp: key.NewBinding(
		key.WithKeys("pgup", "ctrl+b"),
		key.WithHelp("PgUp/C-b", "page up"),
	),
	PgDown: key.NewBinding(
		key.WithKeys("pgdown", "ctrl+f"),
		key.WithHelp("PgDn/C-f", "page down"),
	),
	Home: key.NewBinding(
		key.WithKeys("home", "g"),
		key.WithHelp("Home/g", "top"),
	),
	End: key.NewBinding(
		key.WithKeys("end", "G"),
		key.WithHelp("End/G", "bottom"),
	),
	Search: key.NewBinding(
		key.WithKeys("/"),
		key.WithHelp("/", "focus search"),
	),
	Apply: key.NewBinding(
		key.WithKeys("enter"),
		key.WithHelp("Enter", "apply search / select"),
	),
	Clear: key.NewBinding(
		key.WithKeys("esc"),
		key.WithHelp("Esc", "clear/exit search"),
	),
	Reload: key.NewBinding(
		key.WithKeys("r"),
		key.WithHelp("r", "reload"),
	),
	Help: key.NewBinding(
		key.WithKeys("?"),
		key.WithHelp("?", "toggle help"),
	),
	Select: key.NewBinding(
		key.WithKeys("enter"),
		key.WithHelp("Enter", "select item"),
	),
	Quit: key.NewBinding(
		key.WithKeys("q", "ctrl+c"),
		key.WithHelp("q", "quit"),
	),
	Back: key.NewBinding(
		key.WithKeys("b"),
		key.WithHelp("b", "back"),
	),
}
