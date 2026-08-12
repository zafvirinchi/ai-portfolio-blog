import { randomUUID } from "node:crypto";

import { candidateService } from "../recruiter/candidate-service";

import { jobService } from "./job-service";
import { notificationService } from "./notification-service";
import { pipelineService } from "./pipeline-service";
import { OfferStatus } from "./pipeline-schema";
import { Offer } from "./pipeline-types";

export interface OfferCreateInput {
  pipelineCandidateId: string;
  salary?: string | null;
  startDate?: string | null;
  expiryDate?: string | null;
}

export class OfferService {
  private readonly offers = new Map<string, Offer>();

  async create(input: OfferCreateInput): Promise<Offer> {
    const pc = pipelineService.get(input.pipelineCandidateId);

    if (!pc) {
      throw new Error("Pipeline candidate not found, or their resume has expired.");
    }

    const offerId = randomUUID();
    const now = new Date().toISOString();

    const offer: Offer = {
      offerId,
      jobId: pc.jobId,
      pipelineCandidateId: input.pipelineCandidateId,
      salary: input.salary ?? null,
      startDate: input.startDate ?? null,
      expiryDate: input.expiryDate ?? null,
      status: "Draft",
      createdAt: now,
      updatedAt: now,
    };

    this.offers.set(offerId, offer);
    pipelineService.setOfferId(input.pipelineCandidateId, offerId);

    const job = jobService.get(pc.jobId);
    const candidateName = (await candidateService.listForSystemUse()).find((c) => c.candidateId === pc.candidateId)?.name ?? "A candidate";

    notificationService.emit({
      type: "Offer Generated",
      message: `An offer was created for ${candidateName}${job ? ` (${job.title})` : ""}.`,
      jobId: pc.jobId,
      pipelineCandidateId: input.pipelineCandidateId,
    });

    return offer;
  }

  updateStatus(offerId: string, status: OfferStatus): Offer {
    const offer = this.requireOffer(offerId);
    offer.status = status;
    offer.updatedAt = new Date().toISOString();
    return offer;
  }

  list(filter?: { jobId?: string; pipelineCandidateId?: string }): Offer[] {
    let results = [...this.offers.values()];

    if (filter?.jobId) results = results.filter((offer) => offer.jobId === filter.jobId);
    if (filter?.pipelineCandidateId) results = results.filter((offer) => offer.pipelineCandidateId === filter.pipelineCandidateId);

    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(offerId: string): Offer | undefined {
    return this.offers.get(offerId);
  }

  private requireOffer(offerId: string): Offer {
    const offer = this.offers.get(offerId);

    if (!offer) {
      throw new Error("Offer not found.");
    }

    return offer;
  }
}

export const offerService = new OfferService();
