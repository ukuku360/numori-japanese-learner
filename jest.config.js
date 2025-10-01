module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'server.js',
    'public/script.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '**/tests/**/*.js',
    '**/tests/**/*.test.js',
  ],
  verbose: true,
};