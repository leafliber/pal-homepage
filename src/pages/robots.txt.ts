import { site } from '../data/site';
export const GET = () => new Response(`User-agent: *\nAllow: /\n${site.url ? `Sitemap: ${site.url}/sitemap.xml\n` : ''}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
