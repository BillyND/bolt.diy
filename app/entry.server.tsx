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

  responseHeaders.set('Content-Type', 'text/html');
  responseHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
  responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

  const doctype = '<!DOCTYPE html>';
  const head = renderHeadToString({ request, remixContext, Head });
  const htmlStart = `<html lang="en" data-theme="${themeStore.value}"><head>${head}</head><body><div id="root" class="w-full h-full">`;
  const htmlEnd = '</div></body></html>';

  // Use renderToString for browser environments
  // or when renderToPipeableStream isn't available
  if (typeof ReactDOMServer.renderToString === 'function') {
    let html = doctype + htmlStart;
    html += ReactDOMServer.renderToString(<RemixServer context={remixContext} url={request.url} />);
    html += htmlEnd;

    return new Response(html, {
      headers: responseHeaders,
      status: responseStatusCode,
    });
  }
  // This will only run in a Node.js environment
  else if (typeof ReactDOMServer.renderToPipeableStream === 'function') {
    return new Promise((resolve, reject) => {
      let didError = false;
      const { pipe, abort } = ReactDOMServer.renderToPipeableStream(
        <RemixServer context={remixContext} url={request.url} />,
        {
          onAllReady() {
            const chunks: Array<Uint8Array> = [];

            // Create a custom writable stream-like object
            const writable = {
              write(chunk: Uint8Array) {
                chunks.push(chunk);
              },
              end() {
                const body = doctype + htmlStart + Buffer.concat(chunks).toString() + htmlEnd;

                resolve(
                  new Response(body, {
                    status: didError ? 500 : responseStatusCode,
                    headers: responseHeaders,
                  }),
                );
              },
              on() {},
              once() {},
              emit() {},
              removeListener() {},
            };

            // @ts-ignore - This is a Node.js specific API
            pipe(writable);
          },
          onShellError(error: Error) {
            didError = true;
            console.error(error);

            reject(
              new Response(doctype + '<html><body><h1>Server Error</h1></body></html>', {
                status: 500,
                headers: { 'Content-Type': 'text/html' },
              }),
            );
          },
          onError(error: Error) {
            didError = true;
            console.error(error);
          },
        },
      );

      if (isbot(request.headers.get('user-agent') || '')) {
        setTimeout(() => {
          abort();
        }, 5000);
      }

      request.signal.addEventListener('abort', () => {
        abort();
      });
    });
  } else {
    // Fallback in case neither method is available
    return new Response(doctype + '<html><body><h1>Server rendering is not available</h1></body></html>', {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
