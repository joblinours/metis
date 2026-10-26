package updater

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"time"

	updaterv1 "github.com/trymetis/metis/apps/updater/gen/metis/updater/v1"
	"google.golang.org/protobuf/encoding/protojson"
)

type Snapshot struct {
	TakenAt   time.Time `json:"takenAt"`
	Installed string    `json:"installed"`
}

type State struct {
	Previous *Images
	Snapshot *Snapshot
	Last     *updaterv1.Upgrade
}

type storedState struct {
	Previous *Images         `json:"previous,omitempty"`
	Snapshot *Snapshot       `json:"snapshot,omitempty"`
	Last     json.RawMessage `json:"last,omitempty"`
}

type StateFile struct {
	Path string
}

func (file StateFile) Load() (State, error) {
	data, err := os.ReadFile(file.Path)
	if errors.Is(err, fs.ErrNotExist) {
		return State{}, nil
	}
	if err != nil {
		return State{}, err
	}
	var stored storedState
	if err := json.Unmarshal(data, &stored); err != nil {
		return State{}, err
	}
	state := State{Previous: stored.Previous, Snapshot: stored.Snapshot}
	if len(stored.Last) > 0 {
		state.Last = &updaterv1.Upgrade{}
		if err := protojson.Unmarshal(stored.Last, state.Last); err != nil {
			return State{}, err
		}
	}
	return state, nil
}

func (file StateFile) Save(state State) error {
	stored := storedState{Previous: state.Previous, Snapshot: state.Snapshot}
	if state.Last != nil {
		last, err := protojson.Marshal(state.Last)
		if err != nil {
			return err
		}
		stored.Last = last
	}
	data, err := json.MarshalIndent(stored, "", "  ")
	if err != nil {
		return err
	}
	tmp := file.Path + ".tmp"
	if err := os.WriteFile(tmp, append(data, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, file.Path)
}
