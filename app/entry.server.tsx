import type { AppLoadContext } from '@remix-run/cloudflare';
import { RemixServer } from '@remix-run/react';
import { isbot } from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';
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

  const isBot = isbot(request.headers.get('user-agent') || '');

  return new Promise((resolve, reject) => {
    let didError = false;

    const { pipe, abort } = renderToPipeableStream(<RemixServer context={remixContext} url={request.url} />, {
      onShellReady() {
        const head = renderHeadToString({ request, remixContext, Head });
        const htmlStart = `<!DOCTYPE html><html lang="en" data-theme="${themeStore.value}"><head>${head}</head><body><div id="root" class="w-full h-full">`;
        const htmlEnd = '</div></body></html>';

        // Tạo response từ stream
        const chunks: Array<Uint8Array> = [];
        const bodyStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(htmlStart));

            pipe({
              write(chunk) {
                controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
              },
              end() {
                controller.enqueue(new TextEncoder().encode(htmlEnd));
                controller.close();
              },
              on() {},
              off() {},
              destroy() {},
            });
          },
          cancel() {
            abort();
          },
        });

        responseHeaders.set('Content-Type', 'text/html');
        responseHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
        responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

        resolve(
          new Response(bodyStream, {
            headers: responseHeaders,
            status: didError ? 500 : responseStatusCode,
          }),
        );
      },
      onShellError(error: unknown) {
        reject(error);
      },
      onError(error: unknown) {
        didError = true;
        console.error(error);
      },
    });

    // Kết thúc stream nếu request timed out
    setTimeout(() => {
      abort();
    }, 10000);
  });
}
