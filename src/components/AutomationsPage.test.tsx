// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AutomationsPage } from './AutomationsPage';
import * as api from '../lib/api';
vi.mock('../lib/api', async (original) => ({
  ...await original<typeof api>(), isTauri: () => false,
  automationsList: vi.fn().mockResolvedValue([]),
  automationRunnerStatus: vi.fn().mockResolvedValue({running:false}),
  schedulesLaunchAgentStatus: vi.fn().mockResolvedValue({supported:false}),
  automationUpdate: vi.fn(), automationCreate: vi.fn(),
}));
const t = (s: string) => s;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
 it('Editing a weekly schedule preserves saved weekdays',async()=>{
  const row={id:'weekly',title:'weekly task',prompt:'report',enabled:true,projectId:null,modelId:'grok-4.6',effort:'high',frequency:'weekly',time:'09:00',weekdays:[1,3,5],notify:'all',createdAt:'2026-09-14T00:00:00Z',updatedAt:'2026-09-14T00:00:00Z'};
  vi.mocked(api.automationsList).mockResolvedValue([row]);vi.mocked(api.automationUpdate).mockResolvedValue(row);
  render(<AutomationsPage t={t} projects={[]} onAiCreate={()=>{}}/>);
  await screen.findByText('weekly task');fireEvent.click(screen.getByText('weekly task'));
  fireEvent.click(screen.getByText('automations.save'));
  await waitFor(()=>expect(api.automationUpdate).toHaveBeenCalled());
  expect(vi.mocked(api.automationUpdate).mock.calls[0][1].weekdays).toEqual([1,3,5]);
 });

it('lets users select weekdays and keeps at least one selected', async () => {
  vi.mocked(api.automationsList).mockResolvedValue([]);
  render(<AutomationsPage t={t} projects={[]} onAiCreate={() => {}} />);
  fireEvent.click(await screen.findByText('automations.createManual'));
  fireEvent.click(screen.getByLabelText('automations.field.frequency'));
  fireEvent.click(await screen.findByRole('button', { name: 'automations.freq.weekly' }));
  const buttons = screen.getByRole('group', { name: 'automations.freq.weekly' }).querySelectorAll('button');
  expect(buttons).toHaveLength(7);
  const initial = [...buttons].find(b => b.getAttribute('aria-pressed') === 'true')!;
  expect(initial.disabled).toBe(true);
  const other = [...buttons].find(b => b !== initial)!;
  fireEvent.click(other);
  expect(initial.disabled).toBe(false);
  fireEvent.click(initial);
  expect(other.disabled).toBe(true);
});
