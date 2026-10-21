import type { FastifyInstance } from 'fastify';

import {
  CONVERT_LIMITS,
  ConvertError,
  convertFile,
  createGate,
  type ConvertKind,
} from '../convert.ts';
import type { Env } from '../env.ts';
import { ApiError, type ApiErrorCode } from '../http.ts';

const KINDS: ConvertKind[] = ['word-to-pdf', 'pdf-to-word'];

/** ConvertError carries plain strings; the HTTP layer only speaks in known codes. */
function toApiCode(code: string): ApiErrorCode {
  switch (code) {
    case 'empty_file':
    case 'file_too_large':
    case 'unsupported_type':
    case 'converter_missing':
    case 'conversion_failed':
    case 'timeout':
      return code;
    default:
      return 'internal';
  }
}

/** Module level so every request shares the same concurrency budget. */
const gate = createGate(CONVERT_LIMITS.maxConcurrent);

export function registerConvertRoutes(app: FastifyInstance, deps: { env: Env }): void {
  const { env } = deps;

  app.post('/api/convert/:kind', async (request, reply) => {
    const { kind } = request.params as { kind: string };
    if (!KINDS.includes(kind as ConvertKind)) {
      throw new ApiError(404, 'not_found', 'ไม่รู้จักชนิดการแปลงนี้');
    }

    const rawName = request.headers['x-file-name'];
    const fileName = (Array.isArray(rawName) ? rawName[0] : rawName) ?? '';
    if (!fileName) throw new ApiError(400, 'invalid_request', 'ต้องส่ง header x-file-name');
    if (!Buffer.isBuffer(request.body)) {
      throw new ApiError(415, 'unsupported_type', 'ส่งไฟล์เป็น application/octet-stream');
    }

    try {
      const output = await gate(() =>
        convertFile(kind as ConvertKind, decodeURIComponent(fileName), request.body as Buffer, {
          sofficePath: env.sofficePath,
        }),
      );

      reply
        .header('content-type', output.mime)
        .header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(output.fileName)}`)
        .header('cache-control', 'no-store');
      return reply.send(Buffer.from(output.bytes));
    } catch (error) {
      if (error instanceof ConvertError) {
        throw new ApiError(error.status, toApiCode(error.code), error.message);
      }
      throw error;
    }
  });
}
