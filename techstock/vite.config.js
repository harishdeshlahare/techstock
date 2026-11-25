const yahooProxy = {
  target: 'https://query1.finance.yahoo.com',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
};

const growwProxy = {
  target: 'https://groww.in',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api\/groww/, '/v1/api'),
};

export default {
  server: {
    proxy: {
      '/api/yahoo': yahooProxy,
      '/api/groww': growwProxy,
    },
  },
  preview: {
    proxy: {
      '/api/yahoo': yahooProxy,
      '/api/groww': growwProxy,
    },
  },
};
