export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event);
  const url = getRequestURL(event);
  return proxyRequest(event, `${config.apiProxyTarget}${url.pathname}${url.search}`);
});
