import { All, Controller, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DomainError, ErrorCode } from '@staysphere/contracts';
import type { Principal } from '@staysphere/service-core';
import { ProxyService } from './proxy.service.js';
import { matchRoute, stripApiPrefix } from './route-table.js';

interface GatewayRequest {
  method: string;
  originalUrl?: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  principal?: Principal;
}

interface GatewayResponse {
  status(code: number): GatewayResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

/**
 * Catch-all proxy. Declared last so the gateway's own `/health`, `/ready` and
 * `/metrics` controllers win the route match.
 */
@ApiExcludeController()
@Controller('api/v1')
export class GatewayController {
  constructor(private readonly proxy: ProxyService) {}

  @All('*')
  async forward(@Req() req: GatewayRequest, @Res() res: GatewayResponse): Promise<void> {
    const [pathname = '', query = ''] = (req.originalUrl ?? req.url).split('?');
    const path = stripApiPrefix(pathname);
    const route = matchRoute(path);

    if (!route) {
      throw new DomainError(ErrorCode.NOT_FOUND, `No route is configured for '${path}'.`);
    }

    const upstream = await this.proxy.forward(route, {
      method: req.method,
      path,
      query,
      headers: req.headers,
      body: req.body,
      ...(req.principal ? { principal: req.principal } : {}),
    });

    for (const [name, value] of Object.entries(upstream.headers)) {
      res.setHeader(name, value);
    }
    res.status(upstream.status).json(upstream.body);
  }
}
