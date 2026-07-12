export class AnswerBuilder {

  build(answer: string) {

    return answer.trim();

  }

}

export const answerBuilder =
  new AnswerBuilder();