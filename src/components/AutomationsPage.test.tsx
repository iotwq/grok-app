// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

it('submits Create once while pending and retains input after failure for retry', async () => {
  vi.mocked(api.automationsList).mockResolvedValue([]);
  let reject!: (e: Error) => void;
  vi.mocked(api.automationCreate).mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
  render(<AutomationsPage t={t} projects={[]} onAiCreate={() => {}} />);
  fireEvent.click(await screen.findByText('automations.createManual'));
  fireEvent.change(screen.getByPlaceholderText('automations.field.titlePh'), { target: { value: 'Test' } });
  fireEvent.change(screen.getByPlaceholderText('automations.field.promptPh'), { target: { value: 'Report' } });
  const panel = screen.getByRole('complementary');
  const create = within(panel).getByRole('button', { name: 'automations.create' });
  fireEvent.click(create);
  fireEvent.click(create);
  expect(api.automationCreate).toHaveBeenCalledTimes(1);
  expect(create.hasAttribute('disabled')).toBe(true);
  fireEvent.click(within(panel).getByText('common.cancel'));
  expect(screen.getByRole('complementary')).toBe(panel);
  await act(async () => { reject(new Error('disk full')); });
  expect(within(panel).getByRole('alert').textContent).toContain('disk full');
  expect((screen.getByPlaceholderText('automations.field.titlePh') as HTMLInputElement).value).toBe('Test');
  fireEvent.click(within(panel).getByRole('button', { name: 'automations.create' }));
  await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());
  expect(api.automationCreate).toHaveBeenCalledTimes(2);
});
