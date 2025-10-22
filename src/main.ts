import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as compression from 'compression';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express'; 

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  
  app.use(helmet());
  app.use(compression());
  
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      forbidNonWhitelisted:false,
      whitelist: true,
    }),
  );
  



  app.enableCors()
 
  // Configure CORS properly for authentication
  // app.enableCors({
  //   // origin: process.env.FRONTEND_URL || 'http://localhost:5500/',
  //   origin:'http://localhost:5500',
  //   methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  //   allowedHeaders: [
  //     'Content-Type',
  //     'Authorization',
  //     'X-Requested-With',
  //     'Accept',
  //     'Origin',
  //     'Access-Control-Request-Method',
  //     'Access-Control-Request-Headers',
  //   ],
  //   credentials: true,
  //   optionsSuccessStatus: 200,
  // });

  const config = new DocumentBuilder()
    .setTitle('🎭 Artistic Backend API Docs')
    .setDescription('API documentation for the event, booking & artist system.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();