// The site moved from deepanshu-portfolio.deepanshu-portfolio.workers.dev to Cloudflare Pages.
// This worker keeps the old address alive for links already sent out, forwarding every path
// and query string permanently.

const ORIGIN = "https://deepanshupayal.pages.dev";

export default {
  fetch(request: Request): Response {
    const { pathname, search } = new URL(request.url);
    return Response.redirect(`${ORIGIN}${pathname}${search}`, 301);
  },
};
