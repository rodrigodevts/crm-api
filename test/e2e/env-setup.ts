// Sets env var defaults BEFORE any test file imports AppModule.
// AppModule's ConfigModule.forRoot({ validate: validateEnv }) runs at import
// time, so any env vars not present then will fail validation.
// DATABASE_URL is overwritten later by test/setup-prisma.ts beforeAll once
// the testcontainer boots — the placeholder here is just to satisfy the
// import-time validator.

process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL = 'fatal';

process.env.DATABASE_URL ??= 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
process.env.REDIS_URL ??= 'redis://localhost:6379';

process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-32-chars-minimum-aaa';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-32-chars-minimum-aaa';

process.env.CHANNEL_CONFIG_ENCRYPTION_KEY ??=
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

process.env.S3_ENDPOINT ??= 'http://localhost:9000';
process.env.S3_ACCESS_KEY ??= 'minioadmin';
process.env.S3_SECRET_KEY ??= 'minioadmin';
process.env.S3_BUCKET ??= 'test';
