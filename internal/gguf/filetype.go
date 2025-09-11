package gguf

import (
	"fmt"
	"strings"
)

func ExtractFileType(rr *RNGReader) (string, error) {
	magic, err := rr.ReadExact(4)
	if err != nil {
		return "", err
	}
	if readU32LE(magic) != 0x46554747 {
		return "", fmt.Errorf("not gguf")
	}
	verB, err := rr.ReadExact(4)
	if err != nil {
		return "", err
	}
	ver := readU32LE(verB)
	if ver > 3 {
		return "", fmt.Errorf("unsupported gguf version %d", ver)
	}
	if ver >= 1 {
		if _, err := rr.ReadExact(8); err != nil {
			return "", err
		}
	}
	kvB, err := rr.ReadExact(8)
	if err != nil {
		return "", err
	}
	metaCount := int(readU64LE(kvB))
	for i := 0; i < metaCount; i++ {
		lB, err := rr.ReadExact(8)
		if err != nil {
			return "", err
		}
		l := int(readU64LE(lB))
		if l > 1<<20 {
			return "", fmt.Errorf("key too long")
		}
		keyB, err := rr.ReadExact(l)
		if err != nil {
			return "", err
		}
		key := string(keyB)
		tB, err := rr.ReadExact(4)
		if err != nil {
			return "", err
		}
		t := readU32LE(tB)
		if key == "general.file_type" {
			switch t {
			case 4, 5, 6:
				vB, err := rr.ReadExact(4)
				if err != nil {
					return "", err
				}
				val := readU32LE(vB)
				return fmt.Sprintf("FTYPE_%d", val), nil
			case 8:
				lTok, err := rr.ReadExact(8)
				if err != nil {
					return "", err
				}
				ln := int(readU64LE(lTok))
				if ln > 1<<20 {
					return "", fmt.Errorf("string too long")
				}
				sB, err := rr.ReadExact(ln)
				if err != nil {
					return "", err
				}
				return strings.ToUpper(string(sB)), nil
			default:
				if err := skipValue(rr, t); err != nil {
					return "", err
				}
				return "", nil
			}
		}
		if err := skipValue(rr, t); err != nil {
			return "", err
		}
	}
	return "", nil
}
