package storage

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

type S3Storage struct {
	client    *s3.Client
	bucket    string
	cdnDomain string // if set, returned URLs use this instead of bucket name
	endpoint  string // custom endpoint (MinIO, etc.) — if set, use path-style URLs
}

// NewS3StorageFromEnv creates an S3Storage from environment variables.
// Returns nil if S3_BUCKET is not set.
//
// Environment variables:
//   - S3_BUCKET (required)
//   - S3_REGION (default: us-west-2)
//   - S3_ENDPOINT (optional; for MinIO or other S3-compatible services)
//   - AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (optional; falls back to default credential chain)
//   - CLOUDFRONT_DOMAIN (optional; for CDN URLs)
func NewS3StorageFromEnv() *S3Storage {
	bucket := os.Getenv("S3_BUCKET")
	if bucket == "" {
		slog.Info("S3_BUCKET not set, file upload disabled")
		return nil
	}

	region := os.Getenv("S3_REGION")
	if region == "" {
		region = "us-west-2"
	}

	opts := []func(*config.LoadOptions) error{
		config.WithRegion(region),
	}

	accessKey := os.Getenv("AWS_ACCESS_KEY_ID")
	secretKey := os.Getenv("AWS_SECRET_ACCESS_KEY")
	if accessKey != "" && secretKey != "" {
		opts = append(opts, config.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(accessKey, secretKey, ""),
		))
	}

	cfg, err := config.LoadDefaultConfig(context.Background(), opts...)
	if err != nil {
		slog.Error("failed to load AWS config", "error", err)
		return nil
	}

	endpoint := os.Getenv("S3_ENDPOINT")
	cdnDomain := os.Getenv("CLOUDFRONT_DOMAIN")

	var s3Opts []func(*s3.Options)
	if endpoint != "" {
		s3Opts = append(s3Opts, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(endpoint)
			o.UsePathStyle = true // MinIO requires path-style URLs
		})
	}

	slog.Info("S3 storage initialized", "bucket", bucket, "region", region, "endpoint", endpoint, "cdn_domain", cdnDomain)
	return &S3Storage{
		client:    s3.NewFromConfig(cfg, s3Opts...),
		bucket:    bucket,
		cdnDomain: cdnDomain,
		endpoint:  endpoint,
	}
}

// sanitizeFilename removes characters that could cause header injection in Content-Disposition.
func sanitizeFilename(name string) string {
	var b strings.Builder
	b.Grow(len(name))
	for _, r := range name {
		// Strip control chars, newlines, null bytes, quotes, semicolons, backslashes
		if r < 0x20 || r == 0x7f || r == '"' || r == ';' || r == '\\' || r == '\x00' {
			b.WriteRune('_')
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// KeyFromURL extracts the S3 object key from a CDN, bucket, or endpoint URL.
// e.g. "https://multica-static.copilothub.ai/abc123.png" → "abc123.png"
// e.g. "http://localhost:9000/bucket/abc123.png" → "abc123.png" (MinIO path-style)
func (s *S3Storage) KeyFromURL(rawURL string) string {
	prefixes := []string{
		"https://" + s.cdnDomain + "/",
		"https://" + s.bucket + "/",
	}
	if s.endpoint != "" {
		// path-style MinIO URL: http://localhost:9000/bucket/key
		prefixes = append(prefixes,
			strings.TrimRight(s.endpoint, "/")+"/"+s.bucket+"/",
		)
	}
	for _, prefix := range prefixes {
		if prefix != "/" && strings.HasPrefix(rawURL, prefix) {
			return strings.TrimPrefix(rawURL, prefix)
		}
	}
	// Fallback: take everything after the last "/".
	if i := strings.LastIndex(rawURL, "/"); i >= 0 {
		return rawURL[i+1:]
	}
	return rawURL
}

// Delete removes an object from S3. Errors are logged but not fatal.
func (s *S3Storage) Delete(ctx context.Context, key string) {
	if key == "" {
		return
	}
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		slog.Error("s3 DeleteObject failed", "key", key, "error", err)
	}
}

// DeleteKeys removes multiple objects from S3. Best-effort, errors are logged.
func (s *S3Storage) DeleteKeys(ctx context.Context, keys []string) {
	for _, key := range keys {
		s.Delete(ctx, key)
	}
}

func (s *S3Storage) Upload(ctx context.Context, key string, data []byte, contentType string, filename string) (string, error) {
	safe := sanitizeFilename(filename)
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:             aws.String(s.bucket),
		Key:                aws.String(key),
		Body:               bytes.NewReader(data),
		ContentType:        aws.String(contentType),
		ContentDisposition: aws.String(fmt.Sprintf(`inline; filename="%s"`, safe)),
		CacheControl:       aws.String("max-age=432000,public"),
		StorageClass:       types.StorageClassIntelligentTiering,
	})
	if err != nil {
		return "", fmt.Errorf("s3 PutObject: %w", err)
	}

	var link string
	switch {
	case s.cdnDomain != "":
		link = fmt.Sprintf("https://%s/%s", s.cdnDomain, key)
	case s.endpoint != "":
		// MinIO path-style: http://localhost:9000/bucket/key
		link = fmt.Sprintf("%s/%s/%s", strings.TrimRight(s.endpoint, "/"), s.bucket, key)
	default:
		link = fmt.Sprintf("https://%s/%s", s.bucket, key)
	}
	return link, nil
}
