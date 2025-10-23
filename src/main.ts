import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import * as compression from 'compression';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.use(helmet());
  app.use(compression());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      forbidNonWhitelisted: false,
      whitelist: true,
    }),
  );

  app.enableCors({
    origin: [
      'https://www.artistic.global',
      'https://artistic.global',
      'http://localhost:3000',
      'http://localhost:5500',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
    ],
    credentials: true,
    optionsSuccessStatus: 200,
  });

  const config = new DocumentBuilder()
    .setTitle('🎭 Artistic Backend API Docs')
    .setDescription('API documentation for the event, booking & artist system.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT) || 5000;
  const host = '127.0.0.1'; 

  await app.listen(port, host);
  logger.log(`Server running at http://${host}:${port}/ (prefix: /api)`);
  logger.log(`Swagger docs available at http://${host}:${port}/api/docs`);
}

bootstrap();
