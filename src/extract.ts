import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { ReaderError } from './errors.js';
import { fetchPage, type Page } from './fetch-page.js';

export function extractArticle(page: Page) {
  // Scripts and external resources are never executed or loaded by JSDOM.
  const dom = new JSDOM(page.html, { url: page.url });
  try {
    dom.window.document.querySelectorAll('script,style,iframe,form,noscript').forEach(node => node.remove());
    const article = new Readability(dom.window.document, { maxElemsToParse: 30_000 }).parse();
    if (!article?.textContent || article.textContent.trim().length < 120) {
      throw new ReaderError(422, 'NO_ARTICLE', 'Could not extract a readable article (minimum 120 characters)');
    }
    const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    turndown.remove(['script', 'style', 'iframe', 'form']);
    return {
      url: page.url, title: article.title ?? '', byline: article.byline ?? null,
      excerpt: article.excerpt ?? '', language: article.lang ?? null,
      text: article.textContent.trim(), markdown: turndown.turndown(article.content ?? ''),
      characters: article.textContent.trim().length,
    };
  } catch (error) {
    if (error instanceof ReaderError) throw error;
    throw new ReaderError(422, 'EXTRACTION_FAILED', 'Unable to parse article within extraction limits');
  } finally { dom.window.close(); }
}

export const readArticle = async (url: string) => extractArticle(await fetchPage(url));
