import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@staysphere/contracts';
import { RequirePermissions, zodBody, type Principal } from '@staysphere/service-core';
import { AuditService } from './audit.service.js';
import { listAuditQuerySchema, recordAuditSchema, type RecordAuditDto } from './dto.js';

interface AuthenticatedRequest {
  principal?: Principal;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

@ApiTags('Audit')
@Controller({ path: 'audit', version: '1' })
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(Permission.AUDIT_READ)
  @ApiOperation({ summary: 'Search the audit trail.' })
  list(@Query() query: Record<string, string>) {
    return this.audit.list(listAuditQuerySchema.parse(query));
  }

  @Get('history/:resource/:resourceId')
  @RequirePermissions(Permission.AUDIT_READ)
  @ApiOperation({ summary: 'Everything that happened to one record, oldest first.' })
  history(@Param('resource') resource: string, @Param('resourceId') resourceId: string) {
    return this.audit.history(resource, resourceId);
  }

  @Get('trace/:correlationId')
  @RequirePermissions(Permission.AUDIT_READ)
  @ApiOperation({
    summary: 'Every entry from one interaction, across every service — the incident view.',
  })
  trace(@Param('correlationId') correlationId: string) {
    return this.audit.trace(correlationId);
  }

  @Post()
  @ApiOperation({
    summary: 'Append an entry. Sensitive values are redacted before they are stored.',
  })
  record(@Body(zodBody(recordAuditSchema)) dto: RecordAuditDto, @Req() req: AuthenticatedRequest) {
    const userAgent = req.headers['user-agent'];
    return this.audit.record(dto, {
      ...(req.principal ? { principal: req.principal } : {}),
      ...(req.ip ? { ipAddress: req.ip } : {}),
      ...(typeof userAgent === 'string' ? { userAgent } : {}),
    });
  }
}
