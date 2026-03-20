import { TechRadarApi } from '@backstage-community/plugin-tech-radar';

import { TechRadarLoaderResponse } from '@backstage-community/plugin-tech-radar-common';

import techRadarData from './techRadar.json';

export class ExampleTechRadarClient implements TechRadarApi {
  async load(_id: string | undefined): Promise<TechRadarLoaderResponse> {
    // For example, this converts the timeline dates into date objects
    return {
      ...techRadarData,
      entries: techRadarData.entries.map(entry => ({
        ...entry,
        timeline: entry.timeline.map(snapshot => ({
          ...snapshot,
          date: new Date(snapshot.date),
        })),
      })),
    } as TechRadarLoaderResponse;
  }
}
