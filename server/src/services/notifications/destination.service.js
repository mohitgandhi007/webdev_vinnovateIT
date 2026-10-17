import { destinationRepository } from '../../repositories/destination.repository.js';
import { workspaceRepository } from '../../repositories/workspace.repository.js';
import { notificationDispatcher } from './notification-dispatcher.js';

export class DestinationServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'DestinationServiceError';
    this.statusCode = statusCode;
  }
}

export const destinationService = {
  /**
   * List notification destinations for a workspace
   */
  async listDestinations(workspaceId = null, { is_active = null } = {}) {
    let resolvedWorkspaceId = workspaceId;
    if (!resolvedWorkspaceId) {
      const defaultWorkspace = await workspaceRepository.findOrCreateDefault();
      resolvedWorkspaceId = defaultWorkspace.id;
    }

    return await destinationRepository.findByWorkspaceId(resolvedWorkspaceId, { is_active });
  },

  /**
   * Get single destination by ID (scoped by workspace)
   */
  async getDestinationById(id, workspaceId = null) {
    const destination = await destinationRepository.findById(id);
    if (!destination) {
      throw new DestinationServiceError('Notification destination not found', 404);
    }

    if (workspaceId && destination.workspace_id !== workspaceId) {
      throw new DestinationServiceError('Access denied to destination', 403);
    }

    return destination;
  },

  /**
   * Create destination
   */
  async createDestination({
    workspace_id = null,
    name,
    channel,
    target_destination,
    config = {},
    triggers = {},
    is_active = true
  }) {
    let resolvedWorkspaceId = workspace_id;
    if (!resolvedWorkspaceId) {
      const defaultWorkspace = await workspaceRepository.findOrCreateDefault();
      resolvedWorkspaceId = defaultWorkspace.id;
    }

    // Validate provider format
    const provider = notificationDispatcher.providers[channel];
    if (!provider) {
      throw new DestinationServiceError(`Unsupported channel: ${channel}`, 400);
    }

    const validation = provider.validateDestination(target_destination, config);
    if (!validation.valid) {
      throw new DestinationServiceError(validation.reason || 'Invalid destination configuration', 400);
    }

    return await destinationRepository.create({
      workspace_id: resolvedWorkspaceId,
      name,
      channel,
      target_destination,
      config,
      triggers,
      is_active
    });
  },

  /**
   * Update destination
   */
  async updateDestination(id, updates, workspaceId = null) {
    const destination = await this.getDestinationById(id, workspaceId);

    if (updates.target_destination) {
      const provider = notificationDispatcher.providers[destination.channel];
      if (provider) {
        const validation = provider.validateDestination(updates.target_destination, updates.config || destination.config);
        if (!validation.valid) {
          throw new DestinationServiceError(validation.reason || 'Invalid destination format', 400);
        }
      }
    }

    return await destinationRepository.update(id, updates);
  },

  /**
   * Delete destination
   */
  async deleteDestination(id, workspaceId = null) {
    await this.getDestinationById(id, workspaceId);
    return await destinationRepository.delete(id);
  },

  /**
   * Send test notification to a destination
   */
  async testDestination(id, workspaceId = null) {
    await this.getDestinationById(id, workspaceId);
    return await notificationDispatcher.sendTestNotification(id);
  }
};
