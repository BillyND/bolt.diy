import type { AppLoadContext } from '@remix-run/cloudflare';
import { RemixServer } from '@remix-run/react';
import { isbot } from 'isbot';
import * as ReactDOMServer from 'react-dom/server';
import { renderHeadToString } from 'remix-island';
import { Head } from './root';
import { themeStore } from '~/lib/stores/theme';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: any,
  _loadContext: AppLoadContext,
) {
  // await initializeModelList({});

  const abortController = new AbortController();
  request.signal.addEventListener('abort', () => abortController.abort());

  const doctype = '<!DOCTYPE html>';
  const head = renderHeadToString({ request, remixContext, Head });
  const htmlStart = `<html lang="en" data-theme="${themeStore.value}"><head>${head}</head><body><div id="root" class="w-full h-full">`;
  const htmlEnd = '</div></body></html>';

  // Check if the server environment supports streaming
  if (typeof ReactDOMServer.renderToPipeableStream === 'function') {
    return new Promise((resolve, reject) => {
      const { pipe, abort } = ReactDOMServer.renderToPipeableStream(
        <RemixServer context={remixContext} url={request.url} />,
        {
          onShellReady() {
            responseHeaders.set('Content-Type', 'text/html');
            responseHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
            responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

            const body = new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(doctype + htmlStart));

                pipe(
                  new WritableStream({
                    write(chunk) {
                      controller.enqueue(chunk);
                    },
                    close() {
                      controller.enqueue(new TextEncoder().encode(htmlEnd));
                      controller.close();
                    },
                    abort(reason) {
                      controller.error(reason);
                    },
                  }),
                );
              },
              cancel() {
                abort();
              },
            });

            resolve(
              new Response(body, {
                headers: responseHeaders,
                status: responseStatusCode,
              }),
            );
          },
          onShellError(error) {
            console.error(error);
            reject(
              new Response(doctype + '<html><body><h1>Server Error</h1></body></html>', {
                status: 500,
                headers: { 'Content-Type': 'text/html' },
              }),
            );
          },
          onError(error) {
            console.error(error);
            responseStatusCode = 500;
          },
        },
      );

      if (isbot(request.headers.get('user-agent') || '')) {
        // For bots, we can wait for all suspense boundaries to resolve
        setTimeout(() => {
          abort();
          reject(
            new Response(doctype + '<html><body><h1>Request Timeout</h1></body></html>', {
              status: 504,
              headers: { 'Content-Type': 'text/html' },
            }),
          );
        }, 5000);
      }
    });
  } else {
    // Fallback to renderToString if renderToPipeableStream is not available
    console.warn('renderToPipeableStream is not available, falling back to renderToString');

    let html = doctype + htmlStart;
    html += ReactDOMServer.renderToString(<RemixServer context={remixContext} url={request.url} />);
    html += htmlEnd;

    responseHeaders.set('Content-Type', 'text/html');
    responseHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
    responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

    return new Response(html, {
      headers: responseHeaders,
      status: responseStatusCode,
    });
  }
}
