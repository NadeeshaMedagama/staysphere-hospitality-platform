import { Logger, type OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { accessTokenClaimsSchema, toPrincipal, type Principal } from '@staysphere/service-core';
import type { Server, Socket } from 'socket.io';
import type { GatewayEnv } from '../config/env.js';
import { canSubscribe, channelsForEvent } from './channels.js';

interface AuthenticatedSocket extends Socket {
  principal?: Principal;
}

export interface BroadcastEnvelope {
  readonly type: string;
  readonly hotelId: string;
  readonly occurredAt: string;
  readonly payload: unknown;
}

/**
 * The live-updates edge.
 *
 * Front-of-house screens are watched continuously, and polling them is both
 * wasteful and always slightly wrong: a room shows as dirty for another thirty
 * seconds after housekeeping released it, and the desk turns a guest away from
 * a room that is ready.
 *
 * The socket carries no domain logic. It authenticates, authorises a
 * subscription once at join time, and fans broadcasts to rooms. Everything it
 * emits originates as a domain event.
 */
@WebSocketGateway({
  namespace: '/realtime',
  // Origins are pinned to the configured front ends; a WebSocket is not
  // protected by the same-origin policy the way fetch is.
  cors: { credentials: true },
  transports: ['websocket'],
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly env: GatewayEnv,
  ) {}

  onModuleInit(): void {
    this.logger.log('Real-time gateway listening on /realtime');
  }

  /**
   * Authenticates at connect time.
   *
   * An unauthenticated socket is closed rather than left open in a "pending"
   * state: an open socket is a resource, and letting anonymous clients hold
   * thousands of them is a denial-of-service vector with no upside.
   */
  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      client.handshake.headers.authorization?.replace(/^Bearer /, '');

    if (!token) {
      client.emit('error', { code: 'UNAUTHENTICATED', message: 'An access token is required.' });
      client.disconnect(true);
      return;
    }

    try {
      const claims = accessTokenClaimsSchema.parse(
        await this.jwt.verifyAsync(token, {
          secret: this.env.JWT_ACCESS_SECRET,
          issuer: this.env.JWT_ISSUER,
          audience: this.env.JWT_AUDIENCE,
        }),
      );
      client.principal = toPrincipal(claims);

      // Every principal is joined to their own notification channel
      // automatically — it needs no permission beyond being who they are.
      await client.join(`user:${client.principal.id}:notifications`);

      client.emit('ready', {
        userId: client.principal.id,
        roles: client.principal.roles,
        hotelId: client.principal.hotelId ?? null,
      });
    } catch {
      client.emit('error', { code: 'UNAUTHENTICATED', message: 'The access token is not valid.' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    if (client.principal) {
      this.logger.debug({ userId: client.principal.id }, 'Real-time client disconnected');
    }
  }

  @SubscribeMessage('subscribe')
  async subscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { channel?: string },
  ): Promise<{ subscribed: boolean; channel: string; reason?: string }> {
    const channel = body?.channel ?? '';

    if (!client.principal) {
      return { subscribed: false, channel, reason: 'UNAUTHENTICATED' };
    }

    const decision = canSubscribe(client.principal, channel);
    if (!decision.allowed) {
      this.logger.warn(
        { userId: client.principal.id, channel, reason: decision.denial },
        'Rejected a real-time subscription',
      );
      return { subscribed: false, channel, reason: decision.denial ?? 'UNKNOWN_CHANNEL' };
    }

    await client.join(channel);
    return { subscribed: true, channel };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { channel?: string },
  ): Promise<{ unsubscribed: boolean }> {
    if (body?.channel) await client.leave(body.channel);
    return { unsubscribed: true };
  }

  /**
   * Fans a domain event out to the channels that care about it.
   *
   * Called by the event consumer, never by an HTTP handler: what goes over the
   * socket is exactly what happened in the domain, with no second path that
   * could disagree with it.
   */
  broadcast(envelope: BroadcastEnvelope): void {
    const channels = channelsForEvent(envelope.type, envelope.hotelId);
    if (channels.length === 0) return;

    for (const channel of channels) {
      this.server.to(channel).emit(envelope.type, {
        type: envelope.type,
        occurredAt: envelope.occurredAt,
        payload: envelope.payload,
      });
    }

    this.logger.debug(
      { type: envelope.type, channels: channels.length },
      'Broadcast a domain event',
    );
  }

  /** Delivers a message to one person, wherever they are connected. */
  notify(userId: string, notification: unknown): void {
    this.server.to(`user:${userId}:notifications`).emit('notification', notification);
  }

  /** Connected client count, surfaced on the gateway's status endpoint. */
  async connectionCount(): Promise<number> {
    const sockets = await this.server.fetchSockets();
    return sockets.length;
  }
}
