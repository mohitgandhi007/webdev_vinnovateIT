import { db } from '../config/database.js';
import { monitorRepository } from '../repositories/monitor.repository.js';
import { canonicalTargetRepository } from '../repositories/canonical-target.repository.js';
import { workspaceRepository } from '../repositories/workspace.repository.js';
import { validateSafeUrl } from '../utils/ssrf.js';
import { scheduler } from '../jobs/scheduler.js';
import { monitorRunner } from '../jobs/monitor-runner.js';
import { TextNormalizer } from '../utils/text-normalizer.js';



export class MonitorServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'MonitorServiceError';
    this.statusCode = statusCode;
  }
}

export const monitorService = {
  /**
   * Create a new monitor
   */
  async createMonitor({
    name,
    url,
    mode = 'both',
    check_cadence = '15m',
    css_selector = '',
    ignored_selectors = '',
    ignore_patterns = [],
    noise_threshold_percent = 5,
    numeric_selector = '',
    numeric_unit = '',
    workspace_id = null
  }) {
    // 1. SSRF and Protocol Validation
    const urlValidation = await validateSafeUrl(url);
    if (!urlValidation.valid) {
      throw new MonitorServiceError(`Invalid or restricted URL: ${urlValidation.reason}`, 400);
    }

    // 2. Validate numeric_selector format if supplied
    if (numeric_selector && !TextNormalizer.isValidSelector(numeric_selector)) {
      throw new MonitorServiceError(`Invalid numeric CSS selector format: '${numeric_selector}'`, 400);
    }

    // 3. Resolve Workspace
    let resolvedWorkspaceId = workspace_id;
    if (!resolvedWorkspaceId) {
      const defaultWorkspace = await workspaceRepository.findOrCreateDefault();
      resolvedWorkspaceId = defaultWorkspace.id;
    }

    // 4. Register or resolve Canonical Target (Deduplication layer)
    const canonicalTarget = await canonicalTargetRepository.findOrCreate({
      url,
      cssSelector: css_selector || '',
      viewportWidth: 1440,
      viewportHeight: 900
    });

    // 5. Create Monitor Record
    const monitor = await monitorRepository.create({
      workspace_id: resolvedWorkspaceId,
      canonical_target_id: canonicalTarget.id,
      name: name.trim(),
      url: url.trim(),
      mode,
      check_cadence,
      css_selector: (css_selector || '').trim(),
      ignored_selectors: (ignored_selectors || '').trim(),
      ignore_patterns: ignore_patterns || [],
      noise_threshold_percent,
      numeric_selector: (numeric_selector || '').trim() || null,
      numeric_unit: (numeric_unit || '').trim() || null,
      status: 'pending' // Honest state: newly configured monitors start pending
    });

    return monitor;
  },

  /**
   * List monitors with pagination and filtering
   */
  async listMonitors({
    workspace_id = null,
    status = null,
    search = '',
    is_active = null,
    page = 1,
    limit = 20,
    sort_by = 'created_at',
    order = 'DESC'
  } = {}) {
    let resolvedWorkspaceId = workspace_id;
    if (!resolvedWorkspaceId) {
      const defaultWorkspace = await workspaceRepository.findOrCreateDefault();
      resolvedWorkspaceId = defaultWorkspace.id;
    }

    return await monitorRepository.findAll({
      workspace_id: resolvedWorkspaceId,
      status,
      search,
      is_active,
      page,
      limit,
      sortBy: sort_by,
      order
    });
  },

  /**
   * Get single monitor by ID
   */
  async getMonitorById(id, workspaceId = null) {
    const monitor = await monitorRepository.findById(id);
    if (!monitor) {
      throw new MonitorServiceError('Monitor not found', 404);
    }
    if (workspaceId && monitor.workspace_id !== workspaceId) {
      throw new MonitorServiceError('Access denied to monitor', 403);
    }
    return monitor;
  },

  /**
   * Update monitor settings
   */
  async updateMonitor(id, updateData, workspaceId = null) {
    // Verify existence
    const existing = await monitorRepository.findById(id);
    if (!existing) {
      throw new MonitorServiceError('Monitor not found', 404);
    }
    if (workspaceId && existing.workspace_id !== workspaceId) {
      throw new MonitorServiceError('Access denied to monitor', 403);
    }

    // If URL is being updated, perform SSRF check and canonical target sync
    if (updateData.url && updateData.url !== existing.url) {
      const urlValidation = await validateSafeUrl(updateData.url);
      if (!urlValidation.valid) {
        throw new MonitorServiceError(`Invalid or restricted URL: ${urlValidation.reason}`, 400);
      }

      const selector = updateData.css_selector !== undefined 
        ? updateData.css_selector 
        : existing.css_selector;

      const newTarget = await canonicalTargetRepository.findOrCreate({
        url: updateData.url,
        cssSelector: selector || '',
        viewportWidth: 1440,
        viewportHeight: 900
      });

      updateData.canonical_target_id = newTarget.id;
    }

    if (typeof updateData.is_reviewed === 'boolean') {
      const isReviewed = updateData.is_reviewed;
      await db.query(
        `UPDATE detected_changes 
         SET is_reviewed = $1, 
             reviewed_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END 
         WHERE monitor_id = $2`,
        [isReviewed, id]
      );
    }

    const updated = await monitorRepository.update(id, updateData);
    return updated;
  },

  /**
   * Delete monitor
   */
  async deleteMonitor(id, workspaceId = null) {
    const existing = await monitorRepository.findById(id);
    if (!existing) {
      throw new MonitorServiceError('Monitor not found', 404);
    }
    if (workspaceId && existing.workspace_id !== workspaceId) {
      throw new MonitorServiceError('Access denied to monitor', 403);
    }
    return await monitorRepository.delete(id);
  },

  /**
   * Trigger an on-demand check for a monitor
   */
  async triggerCheck(id, workspaceId = null, { wait = false } = {}) {
    const monitor = await monitorRepository.findById(id);
    if (!monitor) {
      throw new MonitorServiceError('Monitor not found', 404);
    }
    if (workspaceId && monitor.workspace_id !== workspaceId) {
      throw new MonitorServiceError('Access denied to monitor', 403);
    }

    // Re-validate URL security at execution time
    const urlValidation = await validateSafeUrl(monitor.url);
    if (!urlValidation.valid) {
      throw new MonitorServiceError(`URL check failed security verification: ${urlValidation.reason}`, 400);
    }

    // Prevent repeated clicks from creating unlimited simultaneous jobs
    if (monitor.is_checking) {
      if (wait) {
        // Wait for active execution to conclude, up to 25s
        let waited = 0;
        while (waited < 25000) {
          await new Promise(r => setTimeout(r, 1000));
          waited += 1000;
          const fresh = await monitorRepository.findById(id);
          if (!fresh || !fresh.is_checking) {
            return {
              message: fresh?.last_change_summary ? 'Change detected' : 'Check completed: No alterations detected',
              monitor_id: id,
              status: fresh?.status || 'healthy',
              hasChanged: fresh?.status === 'degraded' || Boolean(fresh?.last_change_summary),
              summary: fresh?.last_change_summary || 'No alterations detected',
              completed_at: new Date().toISOString()
            };
          }
        }
      }
      return {
        message: 'Check is already running for this monitor',
        monitor_id: id,
        status: 'running',
        last_attempt_at: monitor.last_attempt_at
      };
    }

    if (wait) {
      try {
        const checkResult = await monitorRunner.runCheck(id, { isManual: true });
        return {
          message: checkResult.hasChanged ? 'Change detected' : 'Check completed: No alterations detected',
          monitor_id: id,
          status: checkResult.newStatus || 'healthy',
          hasChanged: Boolean(checkResult.hasChanged),
          isBaseline: Boolean(checkResult.isBaseline),
          summary: checkResult.summary,
          changeRecord: checkResult.changeRecord,
          completed_at: new Date().toISOString()
        };
      } catch (err) {
        throw new MonitorServiceError(`Check execution failed: ${err.message}`, 500);
      }
    }

    // Mark monitor as checking
    await monitorRepository.updateStatus(id, 'checking', monitor.status);

    // Enqueue real check through worker mechanism
    monitorRunner.runCheck(id, { isManual: true }).catch(err => {
      // Errors logged by runner
    });

    return {
      message: 'On-demand check initiated',
      monitor_id: id,
      status: 'checking',
      queued_at: new Date().toISOString()
    };
  }
};


