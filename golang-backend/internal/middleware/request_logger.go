package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/huangjin/coding-history/golang-backend/internal/service"
	"gorm.io/gorm"
)

func RequestLogger(db *gorm.DB) gin.HandlerFunc {
	logSvc := service.NewLogService(db)

	return func(c *gin.Context) {
		if !strings.HasPrefix(c.Request.URL.Path, "/api/v1/") {
			c.Next()
			return
		}

		start := time.Now()
		method := c.Request.Method
		url := c.Request.URL.String()

		// Extract route name
		pathParts := strings.Split(strings.Trim(c.Request.URL.Path, "/"), "/")
		routeName := ""
		if len(pathParts) >= 3 {
			routeName = "/" + strings.Join(pathParts[:3], "/")
		}
		var module *string
		if len(pathParts) >= 3 && pathParts[0] == "api" && pathParts[1] == "v1" {
			m := pathParts[2]
			module = &m
		}

		// Capture request body for POST/PUT/PATCH
		var requestBody *string
		if method == "POST" || method == "PUT" || method == "PATCH" {
			bodyBytes, err := io.ReadAll(c.Request.Body)
			if err == nil && len(bodyBytes) > 0 {
				c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
				var body interface{}
				if json.Unmarshal(bodyBytes, &body) == nil {
					sanitized := sanitizeRequestBody(body)
					b, _ := json.Marshal(sanitized)
					s := string(b)
					requestBody = &s
				}
			}
		}

		c.Next()

		duration := int(time.Since(start).Milliseconds())
		statusCode := c.Writer.Status()

		logSvc.CreateRequestLog(struct {
			Method       string
			URL          string
			RouteName    *string
			Module       *string
			StatusCode   int
			RequestBody  *string
			ResponseBody *string
			Duration     int
		}{
			Method: method, URL: url, RouteName: &routeName, Module: module,
			StatusCode: statusCode, RequestBody: requestBody, Duration: duration,
		})
	}
}

func sanitizeRequestBody(body interface{}) interface{} {
	switch v := body.(type) {
	case map[string]interface{}:
		result := make(map[string]interface{})
		sensitiveFields := []string{"password", "token", "secret", "apikey", "authorization"}
		for key, val := range v {
			isSensitive := false
			for _, field := range sensitiveFields {
				if strings.EqualFold(key, field) {
					isSensitive = true
					break
				}
			}
			if isSensitive {
				result[key] = "***REDACTED***"
			} else {
				result[key] = sanitizeRequestBody(val)
			}
		}
		return result
	default:
		return body
	}
}
