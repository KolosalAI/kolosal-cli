package gguf

import (
	"fmt"
	"strings"
)

func readU32LE(b []byte) uint32 {
	if len(b) < 4 {
		return 0
	}
	return uint32(b[0]) | uint32(b[1])<<8 | uint32(b[2])<<16 | uint32(b[3])<<24
}

func readU64LE(b []byte) uint64 {
	if len(b) < 8 {
		return 0
	}
	return uint64(b[0]) | uint64(b[1])<<8 | uint64(b[2])<<16 | uint64(b[3])<<24 |
		uint64(b[4])<<32 | uint64(b[5])<<40 | uint64(b[6])<<48 | uint64(b[7])<<56
}

type Params struct {
	AttentionHeads uint32
	KVHeads        uint32
	HiddenLayers   uint32
	HiddenSize     uint64
}

func ParseParams(rr *RNGReader) (*Params, error) {
	b, err := rr.ReadExact(4)
	if err != nil {
		return nil, err
	}
	if readU32LE(b) != 0x46554747 {
		return nil, fmt.Errorf("not gguf")
	}
	verB, err := rr.ReadExact(4)
	if err != nil {
		return nil, err
	}
	ver := readU32LE(verB)
	if ver > 3 {
		return nil, fmt.Errorf("unsupported gguf version %d", ver)
	}
	if ver >= 1 {
		if _, err := rr.ReadExact(8); err != nil {
			return nil, err
		}
	}
	metaB, err := rr.ReadExact(8)
	if err != nil {
		return nil, err
	}
	metaCount := int(readU64LE(metaB))
	p := &Params{}
	found := struct{ ah, kv, hl, hs bool }{}

	for i := 0; i < metaCount; i++ {
		lB, err := rr.ReadExact(8)
		if err != nil {
			return nil, err
		}
		l := int(readU64LE(lB))
		if l > 1<<20 {
			return nil, fmt.Errorf("key too long")
		}
		keyB, err := rr.ReadExact(l)
		if err != nil {
			return nil, err
		}
		key := string(keyB)
		tB, err := rr.ReadExact(4)
		if err != nil {
			return nil, err
		}
		t := readU32LE(tB)

		isHead := strings.HasSuffix(key, ".attention.head_count")
		isKV := strings.HasSuffix(key, ".attention.head_count_kv")
		isBlocks := strings.HasSuffix(key, ".block_count")
		isEmbed := strings.HasSuffix(key, ".embedding_length")

		readU32 := func() (uint32, error) {
			b, err := rr.ReadExact(4)
			if err != nil {
				return 0, err
			}
			return readU32LE(b), nil
		}
		readU64 := func() (uint64, error) {
			b, err := rr.ReadExact(8)
			if err != nil {
				return 0, err
			}
			return readU64LE(b), nil
		}

		switch {
		case isHead:
			if t == 4 || t == 5 {
				v, err := readU32()
				if err != nil {
					return nil, err
				}
				p.AttentionHeads = v
				if !found.kv {
					p.KVHeads = v
					found.kv = true
				}
				found.ah = true
			} else {
				if err := skipValue(rr, t); err != nil {
					return nil, err
				}
			}
		case isKV:
			if t == 4 || t == 5 {
				v, err := readU32()
				if err != nil {
					return nil, err
				}
				p.KVHeads = v
				found.kv = true
			} else {
				if err := skipValue(rr, t); err != nil {
					return nil, err
				}
			}
		case isBlocks:
			if t == 4 || t == 5 {
				v, err := readU32()
				if err != nil {
					return nil, err
				}
				p.HiddenLayers = v
				found.hl = true
			} else {
				if err := skipValue(rr, t); err != nil {
					return nil, err
				}
			}
		case isEmbed:
			if t == 10 || t == 11 || t == 12 {
				v, err := readU64()
				if err != nil {
					return nil, err
				}
				p.HiddenSize = v
				found.hs = true
			} else if t == 4 || t == 5 {
				v, err := readU32()
				if err != nil {
					return nil, err
				}
				p.HiddenSize = uint64(v)
				found.hs = true
			} else {
				if err := skipValue(rr, t); err != nil {
					return nil, err
				}
			}
		default:
			if err := skipValue(rr, t); err != nil {
				return nil, err
			}
		}

		if found.ah && found.hl && found.hs {
			if !found.kv {
				p.KVHeads = p.AttentionHeads
			}
			break
		}
	}
	if !(found.ah && found.hl && found.hs) {
		return nil, fmt.Errorf("required metadata not found")
	}
	if !found.kv {
		p.KVHeads = p.AttentionHeads
	}
	return p, nil
}

func skipArray(rr *RNGReader) error {
	tB, err := rr.ReadExact(4)
	if err != nil {
		return err
	}
	t := readU32LE(tB)
	cB, err := rr.ReadExact(8)
	if err != nil {
		return err
	}
	count := int(readU64LE(cB))
	for i := 0; i < count; i++ {
		if err := skipValue(rr, t); err != nil {
			return err
		}
	}
	return nil
}

func skipString(rr *RNGReader) error {
	lB, err := rr.ReadExact(8)
	if err != nil {
		return err
	}
	l := int(readU64LE(lB))
	if l > 1<<20 {
		return fmt.Errorf("string too long")
	}
	_, err = rr.ReadExact(l)
	return err
}

func skipValue(rr *RNGReader, t uint32) error {
	switch t {
	case 0, 1:
		_, err := rr.ReadExact(1)
		return err
	case 2, 3:
		_, err := rr.ReadExact(2)
		return err
	case 4, 5, 6:
		_, err := rr.ReadExact(4)
		return err
	case 7:
		_, err := rr.ReadExact(1)
		return err
	case 8:
		return skipString(rr)
	case 9:
		return skipArray(rr)
	case 10, 11, 12:
		_, err := rr.ReadExact(8)
		return err
	default:
		return fmt.Errorf("unknown type %d", t)
	}
}
