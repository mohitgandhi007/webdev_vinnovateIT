import { deliveryRepository } from '../../repositories/delivery.repository.js';
import { workspaceRepository } from '../../repositories/workspace.repository.js';
import { notificationDispatcher } from './notification-dispatcher.js';

export class DeliveryServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'DeliveryServiceError';
    this.statusCode = statusCode;
  }
}

export const deliveryService = {
  /**
   * List delivery records for workspace with pagination
   */
  async listDeliveries({
    workspace_id = null,
    destination_id,
    status,
    page = 1,
    limit = 20
  } = {}) {
    let resolvedWorkspaceId = workspace_id;
    if (!resolvedWorkspaceId) {
      const defaultWorkspace = await workspaceRepository.findOrCreateDefault();
      resolvedWorkspaceId = defaultWorkspace.id;
    }

    return await deliveryRepository.listDeliveries(resolvedWorkspaceId, {
      destination_id,
      status,
      page,
      limit
    });
  },

  /**
   * Get single delivery by ID
   */
  async getDeliveryById(id) {
    const delivery = await deliveryRepository.findById(id);
    if (!delivery) {
      throw new DeliveryServiceError('Delivery log not found', 404);
    }
    return delivery;
  },

  /**
   * Manually retry a failed delivery
   */
  async retryDelivery(id) {
    const delivery = await this.getDeliveryById(id);
    const destination = {
      id: delivery.destination_id,
      channel: delivery.channel,
      target_destination: delivery.target_destination,
      config: delivery.config || {}
    };

    const payload = typeof delivery.payload === 'string' ? JSON.parse(delivery.payload) : (delivery.payload || {});

    const provider = notificationDispatcher.providers[delivery.channel];
    if (!provider) {
      throw new DeliveryServiceError(`Unsupported channel: ${delivery.channel}`, 400);
    }

    const sendResult = await provider.send({ destination, payload });

    if (sendResult.success) {
      return await deliveryRepository.update(id, {
        status: 'delivered',
        sent_at: new Date(),
        http_status_code: sendResult.statusCode || 200,
        error_message: null
      });
    }

    return await deliveryRepository.update(id, {
      status: 'failed',
      http_status_code: sendResult.statusCode || 500,
      error_message: sendResult.error || 'Retry attempt failed',
      attempt_count: (delivery.attempt_count || 1) + 1
    });
  }
};
