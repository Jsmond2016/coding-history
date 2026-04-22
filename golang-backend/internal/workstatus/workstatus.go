package workstatus

import "fmt"

type WorkStatusConfig struct {
	Thresholds   Thresholds `json:"thresholds"`
	OvertimeHour int        `json:"overtimeHour"`
}

type Thresholds struct {
	Relaxed    int `json:"relaxed"`
	Normal     int `json:"normal"`
	Busy       int `json:"busy"`
	SuperCrazy int `json:"superCrazy"`
}

var DefaultConfig = WorkStatusConfig{
	Thresholds: Thresholds{
		Relaxed:    6,
		Normal:     10,
		Busy:       15,
		SuperCrazy: 20,
	},
	OvertimeHour: 19,
}

func CalculateWorkStatus(totalCommits int, hasOvertime bool, config WorkStatusConfig) string {
	if hasOvertime {
		if totalCommits >= config.Thresholds.SuperCrazy {
			return "superCrazyOvertime"
		}
		return "overtime"
	}
	if totalCommits < config.Thresholds.Relaxed {
		return "relaxed"
	} else if totalCommits < config.Thresholds.Normal {
		return "normal"
	} else if totalCommits < config.Thresholds.Busy {
		return "busy"
	} else if totalCommits < config.Thresholds.SuperCrazy {
		return "crazy"
	}
	return "crazy"
}

func IsOvertime(commitDateMs int64, overtimeHour int) bool {
	// commitDateMs is milliseconds since epoch
	hour := (commitDateMs / 1000 / 3600) % 24
	// Adjust for timezone offset (assume Asia/Shanghai UTC+8)
	// The timestamp is in UTC, so add 8 hours for CST
	hour = (hour + 8) % 24
	return int(hour) >= overtimeHour
}

func FormatTime(commitDateMs int64) string {
	// Returns HH:mm in local time
	totalMinutes := (commitDateMs / 1000 / 60) % (24 * 60)
	// Adjust for timezone (UTC+8)
	totalMinutes += 8 * 60
	if totalMinutes >= 24*60 {
		totalMinutes -= 24 * 60
	}
	hour := totalMinutes / 60
	minute := totalMinutes % 60
	return fmt.Sprintf("%02d:%02d", hour, minute)
}

var DefaultLabels = map[string]string{
	"relaxed":             "轻松",
	"normal":              "正常",
	"busy":                "忙碌",
	"crazy":               "疯狂",
	"overtime":            "加班",
	"superCrazyOvertime":  "超级疯狂加班",
}

var DefaultColors = map[string]string{
	"relaxed":            "green",
	"normal":             "blue",
	"busy":               "orange",
	"crazy":              "red",
	"overtime":           "red",
	"superCrazyOvertime": "magenta",
}
