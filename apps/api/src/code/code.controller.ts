import { Body, Controller, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Env } from '../config/env';
import { executeCode, runCodeSchema, type RunCodeDto } from './code.service';

@ApiTags('code')
@ApiBearerAuth()
@Controller('code')
@UseGuards(JwtAuthGuard)
export class CodeController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Post('run')
  @ApiOperation({ summary: 'Run source code in the language-matched sandbox compiler' })
  run(@Body(new ZodValidationPipe(runCodeSchema)) dto: RunCodeDto) {
    if (!this.config.get('CODE_RUN_ENABLED', { infer: true })) {
      throw new ServiceUnavailableException(
        'Code execution is disabled on this server. Submit assignments without live run, or enable CODE_RUN_ENABLED in a locked-down runner.',
      );
    }
    return executeCode(dto);
  }
}
