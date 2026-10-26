/**
 * Inline script for <head>: applies the saved theme before the first paint so
 * the page doesn't flash the default colours.
 */
export function themeBootScript(themes: Record<string, { vars: Record<string, string>; pip: string; bg: string; scheme: string; meta: string }>) {
  return `(function(){try{var T=${JSON.stringify(themes)};var s=JSON.parse(localStorage.getItem("ludo.settings")||"{}");var t=T[s.theme];if(!t)return;var r=document.documentElement;for(var k in t.vars)r.style.setProperty("--c-"+k,t.vars[k]);r.style.setProperty("--pip",t.pip);r.style.colorScheme=t.scheme;document.addEventListener("DOMContentLoaded",function(){document.body.style.background=t.bg;document.body.style.backgroundAttachment="fixed";});}catch(e){}})();`;
}
