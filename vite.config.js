const yahooProxy = {
  target: 'https://query1.finance.yahoo.com',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
};

export default {
  server: {
    proxy: {
      '/api/yahoo': yahooProxy,
    },
  },
  preview: {
    proxy: {
      '/api/yahoo': yahooProxy,
    },
  },
};
