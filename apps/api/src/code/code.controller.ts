import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { executeCode, runCodeSchema, type RunCodeDto } from './code.service';

@ApiTags('code')
@ApiBearerAuth()
@Controller('code')
@UseGuards(JwtAuthGuard)
export class CodeController {
  @Post('run')
  @ApiOperation({ summary: 'Run source code in the language-matched sandbox compiler' })
  run(@Body(new ZodValidationPipe(runCodeSchema)) dto: RunCodeDto) {
    return executeCode(dto);
  }
}
