import { Body, Controller, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Env } from '../config/env';
import {
  executeCode,
  runCodeSchema,
  runnerFor,
  needsRuntime,
  type RunCodeDto,
  type RunnerTarget,
} from './code.service';

@ApiTags('code')
@ApiBearerAuth()
@Controller('code')
@UseGuards(JwtAuthGuard)
export class CodeController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Post('run')
  @ApiOperation({ summary: 'Run source code in the language-matched sandbox compiler' })
  run(@Body(new ZodValidationPipe(runCodeSchema)) dto: RunCodeDto) {
    const target = this.runner();
    // Only the languages that need a runtime are gated. Blocking the HTML
    // preview and the SQL syntax check as well made the whole code lab dead on
    // a host with no runner, for no security gain.
    if (needsRuntime(dto.language) && target.kind === 'none') {
      throw new ServiceUnavailableException(
        'Code execution is disabled on this server. Submit assignments without live run, or point CODE_RUNNER_URL at a code runner.',
      );
    }
    return executeCode(dto, target);
  }

  private runner(): RunnerTarget {
    return runnerFor({
      CODE_RUN_ENABLED: this.config.get('CODE_RUN_ENABLED', { infer: true }),
      CODE_RUNNER_URL: this.config.get('CODE_RUNNER_URL', { infer: true }),
      CODE_RUNNER_TOKEN: this.config.get('CODE_RUNNER_TOKEN', { infer: true }),
      CODE_RUNNER_TIMEOUT_MS: this.config.get('CODE_RUNNER_TIMEOUT_MS', { infer: true }),
    });
  }
}
