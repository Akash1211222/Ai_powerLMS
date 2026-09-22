import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import type { Env } from '../config/env';
import { IdeService } from './ide.service';
import { IdeTokenService } from './ide-token.service';

@ApiTags('ide')
@ApiBearerAuth()
@Controller('ide')
@UseGuards(JwtAuthGuard)
export class IdeController {
  constructor(
    private readonly ide: IdeService,
    private readonly tokens: IdeTokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether this server offers the browser VS Code workspace' })
  status() {
    return { enabled: this.ide.enabled };
  }

  @Post('session')
  @ApiOperation({
    summary: "Start (or reuse) the caller's VS Code workspace and return a one-minute link into it",
  })
  async session(@CurrentUser() user: AuthUser) {
    this.assertEnabled();
    const instance = await this.ide.ensure(user.userId);
    const ticket = await this.tokens.signTicket(user.userId, instance.slug);
    const base = this.config.get('API_BASE_URL', { infer: true }).replace(/\/$/, '');
    return { url: `${base}/ide/${instance.slug}/?fca_ticket=${encodeURIComponent(ticket)}` };
  }

  @Delete('session')
  @HttpCode(204)
  @ApiOperation({
    summary: "Stop the caller's workspace. Files are kept; the next open starts fresh.",
  })
  async stop(@CurrentUser() user: AuthUser) {
    this.assertEnabled();
    await this.ide.restart(user.userId);
  }

  private assertEnabled(): void {
    // 404 like the demo route: a host without the IDE should not advertise it.
    if (!this.ide.enabled)
      throw new NotFoundException('The code workspace is not enabled on this server');
  }
}
