import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Response } from 'express';
import {
  createSuccessResponse,
  createErrorResponse,
  sendSuccess,
  sendError,
  sendResourceCreated,
  sendResourceUpdated,
  sendResourceDeleted,
  sendPaginatedResponse,
  sendValidationError,
  sendNotFoundError,
  sendUnauthorizedError,
  sendForbiddenError,
  sendConflictError,
  sendRateLimitError,
  sendDatabaseError,
} from '../../response-utils';

describe('Response Utils - Unit Tests', () => {
  let mockRes: Partial<Response>;
  let mockStatus: jest.Mock;
  let mockJson: jest.Mock;
  let mockSet: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockJson = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnThis();
    mockSet = jest.fn().mockReturnThis();
    
    mockRes = {
      status: mockStatus as any,
      json: mockJson as any,
      set: mockSet as any,
    };
  });

  describe('createSuccessResponse', () => {
    it('should create success response with data', () => {
      const data = { id: 1, name: 'Test' };
      const response = createSuccessResponse(data);

      expect(response).toEqual({
        success: true,
        data,
      });
    });

    it('should include message when provided', () => {
      const data = { id: 1 };
      const message = 'Operation successful';
      const response = createSuccessResponse(data, message);

      expect(response).toEqual({
        success: true,
        data,
        message,
      });
    });

    it('should handle null data', () => {
      const response = createSuccessResponse(null);

      expect(response.success).toBe(true);
      expect(response.data).toBeNull();
    });

    it('should handle array data', () => {
      const data = [1, 2, 3];
      const response = createSuccessResponse(data);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response with message', () => {
      const message = 'An error occurred';
      const response = createErrorResponse(message);

      expect(response).toEqual({
        success: false,
        message,
      });
    });

    it('should include errors array when provided', () => {
      const message = 'Validation failed';
      const errors = ['Field A is required', 'Field B is invalid'];
      const response = createErrorResponse(message, errors);

      expect(response).toEqual({
        success: false,
        message,
        errors,
      });
    });

    it('should not include errors when array is empty', () => {
      const response = createErrorResponse('Error', []);

      expect(response).toEqual({
        success: false,
        message: 'Error',
      });
    });

    it('should include error code when provided', () => {
      const response = createErrorResponse('Error', undefined, 'ERR_CODE');

      expect(response).toEqual({
        success: false,
        message: 'Error',
        code: 'ERR_CODE',
      });
    });

    it('should include metadata when provided', () => {
      const meta = { timestamp: '2024-01-01', userId: '123' };
      const response = createErrorResponse('Error', undefined, undefined, meta);

      expect(response).toEqual({
        success: false,
        message: 'Error',
        meta,
      });
    });

    it('should include all optional fields when provided', () => {
      const response = createErrorResponse(
        'Error',
        ['Field error'],
        'CODE',
        { key: 'value' }
      );

      expect(response).toEqual({
        success: false,
        message: 'Error',
        errors: ['Field error'],
        code: 'CODE',
        meta: { key: 'value' },
      });
    });
  });

  describe('sendSuccess', () => {
    it('should send success response with default status 200', () => {
      const data = { id: 1 };
      sendSuccess(mockRes as Response, data);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data,
      });
    });

    it('should send success response with custom status code', () => {
      const data = { id: 1 };
      sendSuccess(mockRes as Response, data, 'Success', 201);

      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data,
        message: 'Success',
      });
    });

    it('should include message when provided', () => {
      const data = { id: 1 };
      const message = 'Operation successful';
      sendSuccess(mockRes as Response, data, message);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data,
        message,
      });
    });
  });

  describe('sendError', () => {
    it('should send error response with default status 500', () => {
      const message = 'Server error';
      sendError(mockRes as Response, message);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message,
      });
    });

    it('should send error response with custom status code', () => {
      const message = 'Not found';
      sendError(mockRes as Response, message, 404);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message,
      });
    });

    it('should include all error details', () => {
      const message = 'Error';
      const errors = ['Detail 1', 'Detail 2'];
      const code = 'ERR_CODE';
      const meta = { info: 'extra' };

      sendError(mockRes as Response, message, 400, errors, code, meta);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message,
        errors,
        code,
        meta,
      });
    });
  });

  describe('sendResourceCreated', () => {
    it('should send 201 status with default message', () => {
      const data = { id: 1 };
      sendResourceCreated(mockRes as Response, data);

      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data,
        message: 'Resource created successfully',
      });
    });

    it('should use custom message when provided', () => {
      const data = { id: 1 };
      const message = 'User created';
      sendResourceCreated(mockRes as Response, data, message);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data,
        message,
      });
    });
  });

  describe('sendResourceUpdated', () => {
    it('should send 200 status with default message', () => {
      const data = { id: 1, updated: true };
      sendResourceUpdated(mockRes as Response, data);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data,
        message: 'Resource updated successfully',
      });
    });

    it('should use custom message when provided', () => {
      const data = { id: 1 };
      const message = 'Profile updated';
      sendResourceUpdated(mockRes as Response, data, message);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data,
        message,
      });
    });
  });

  describe('sendResourceDeleted', () => {
    it('should send 200 status with default message and null data', () => {
      sendResourceDeleted(mockRes as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: null,
        message: 'Resource deleted successfully',
      });
    });

    it('should use custom message when provided', () => {
      const message = 'User deleted';
      sendResourceDeleted(mockRes as Response, message);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: null,
        message,
      });
    });
  });

  describe('sendPaginatedResponse', () => {
    it('should send paginated response with all metadata', () => {
      const items = [{ id: 1 }, { id: 2 }];
      const offset = 0;
      const limit = 10;
      const total = 25;

      sendPaginatedResponse(mockRes as Response, items, offset, limit, total);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          items,
          pagination: {
            offset,
            limit,
            total,
            hasMore: false,
          },
        },
      });
    });

    it('should calculate hasMore correctly when items equal limit', () => {
      const items = Array(10).fill({ id: 1 });
      sendPaginatedResponse(mockRes as Response, items, 0, 10);

      const callArg = mockJson.mock.calls[0][0] as any;
      expect(callArg.data.pagination.hasMore).toBe(true);
    });

    it('should calculate hasMore correctly when items less than limit', () => {
      const items = Array(5).fill({ id: 1 });
      sendPaginatedResponse(mockRes as Response, items, 0, 10);

      const callArg = mockJson.mock.calls[0][0] as any;
      expect(callArg.data.pagination.hasMore).toBe(false);
    });

    it('should include message when provided', () => {
      const items = [{ id: 1 }];
      const message = 'Users retrieved';

      sendPaginatedResponse(mockRes as Response, items, 0, 10, 1, message);

      const callArg = mockJson.mock.calls[0][0] as any;
      expect(callArg.message).toBe(message);
    });

    it('should handle empty items array', () => {
      const items: any[] = [];

      sendPaginatedResponse(mockRes as Response, items, 0, 10, 0);

      const callArg = mockJson.mock.calls[0][0] as any;
      expect(callArg.data.items).toEqual([]);
      expect(callArg.data.pagination.hasMore).toBe(false);
    });
  });

  describe('sendValidationError', () => {
    it('should send 400 status with default message', () => {
      sendValidationError(mockRes as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
      });
    });

    it('should use custom message and errors', () => {
      const message = 'Invalid input';
      const errors = ['Email is invalid', 'Password too short'];

      sendValidationError(mockRes as Response, message, errors);

      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message,
        errors,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('sendNotFoundError', () => {
    it('should send 404 status with default resource name', () => {
      sendNotFoundError(mockRes as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Resource not found',
        code: 'NOT_FOUND',
      });
    });

    it('should use custom resource name', () => {
      sendNotFoundError(mockRes as Response, 'User');

      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    });
  });

  describe('sendUnauthorizedError', () => {
    it('should send 401 status with default message', () => {
      sendUnauthorizedError(mockRes as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    });

    it('should use custom message', () => {
      const message = 'Invalid token';
      sendUnauthorizedError(mockRes as Response, message);

      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message,
        code: 'UNAUTHORIZED',
      });
    });
  });

  describe('sendForbiddenError', () => {
    it('should send 403 status with default message', () => {
      sendForbiddenError(mockRes as Response);

      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Access forbidden',
        code: 'FORBIDDEN',
      });
    });

    it('should use custom message', () => {
      const message = 'Insufficient permissions';
      sendForbiddenError(mockRes as Response, message);

      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message,
        code: 'FORBIDDEN',
      });
    });
  });

  describe('sendConflictError', () => {
    it('should send 409 status with default message', () => {
      sendConflictError(mockRes as Response);

      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Resource already exists',
        code: 'CONFLICT',
      });
    });

    it('should use custom message', () => {
      const message = 'Email already in use';
      sendConflictError(mockRes as Response, message);

      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message,
        code: 'CONFLICT',
      });
    });
  });

  describe('sendRateLimitError', () => {
    it('should send 429 status without retry header', () => {
      sendRateLimitError(mockRes as Response);

      expect(mockStatus).toHaveBeenCalledWith(429);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Rate limit exceeded. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should set Retry-After header when provided', () => {
      sendRateLimitError(mockRes as Response, 60);

      expect(mockSet).toHaveBeenCalledWith('Retry-After', '60');
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Rate limit exceeded. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    });
  });

  describe('sendDatabaseError', () => {
    let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should handle unique constraint violation (23505)', () => {
      const error = { code: '23505' };
      sendDatabaseError(mockRes as Response, 'user creation', error);

      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'This user creation conflicts with existing data. Please check for duplicates.',
        code: 'CONFLICT',
      });
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should handle foreign key constraint violation (23503)', () => {
      const error = { code: '23503' };
      sendDatabaseError(mockRes as Response, 'appointment booking', error);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid reference in appointment booking. Referenced data does not exist.',
        code: 'VALIDATION_ERROR',
      });
    });

    it('should handle not null constraint violation (23502)', () => {
      const error = { code: '23502' };
      sendDatabaseError(mockRes as Response, 'user update', error);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Missing required field in user update. All required fields must be provided.',
        code: 'VALIDATION_ERROR',
      });
    });

    it('should handle string too long error (22001)', () => {
      const error = { code: '22001' };
      sendDatabaseError(mockRes as Response, 'data insertion', error);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Data too long for data insertion. Please reduce the length of your input.',
        code: 'VALIDATION_ERROR',
      });
    });

    it('should handle unknown database error codes', () => {
      const error = { code: 'UNKNOWN' };
      sendDatabaseError(mockRes as Response, 'database operation', error);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Database error occurred during database operation. Please try again later.',
      });
    });

    it('should handle errors without code property', () => {
      const error = new Error('Database connection failed');
      sendDatabaseError(mockRes as Response, 'query execution', error);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        message: 'Database error occurred during query execution. Please try again later.',
      });
    });

    it('should log all database errors', () => {
      const error = { code: '23505' };
      sendDatabaseError(mockRes as Response, 'test operation', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Database error during test operation:',
        error
      );
    });
  });
});
