import { MetadataGenerator, Parameter, Type } from './metadataGenerator';
import { ResolveType } from './resolveType';
import { getDecoratorName, getDecoratorTextValue } from './../utils/decoratorUtils';
import * as ts from 'typescript';
import { DecoratorsSchema } from './acceptedDecoratorsSchema';

export class ParameterGenerator {
  name: string;
  tsoaDecorator: string;
  constructor(
    private readonly parameter: ts.ParameterDeclaration,
    private readonly method: string,
    private readonly path: string,
    private readonly decoratorsSchema: DecoratorsSchema
  ) {
    this.name = getDecoratorName(this.parameter, identifier => this.supportParameterDecorator(identifier.text)) || '';
    let toaDecorator = this.decoratorsSchema.parameterDecorators.find( d => d.name === this.name );
    this.tsoaDecorator = '';
    if ( !!toaDecorator ) {

      this.tsoaDecorator = toaDecorator.tsoaDecorator;
    }
  }

  public Generate(): Parameter {
    switch (this.tsoaDecorator) {
      case 'Request':
        return this.getRequestParameter(this.parameter);
      case 'Body':
        return this.getBodyParameter(this.parameter);
      case 'BodyProp':
        return this.getBodyPropParameter(this.parameter);
      case 'Header':
        return this.getHeaderParameter(this.parameter);
      case 'Query':
        return this.getQueryParameter(this.parameter);
      case 'Path':
        return this.getPathParameter(this.parameter);
      default:
        // dangerous action
        return this.getQueryParameter(this.parameter);
    }
  }

  private getCurrentLocation() {
    const methodId = (this.parameter.parent as ts.MethodDeclaration).name as ts.Identifier;
    const controllerId = ((this.parameter.parent as ts.MethodDeclaration).parent as ts.ClassDeclaration).name as ts.Identifier;
    return `${controllerId.text}.${methodId.text}`;
  }

  private getRequestParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text;
    return {
      description: this.getParameterDescription(parameter),
      in: 'request',
      name: parameterName,
      required: !parameter.questionToken,
      type: { typeName: 'object' },
      parameterName
    };
  }

  private getBodyPropParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text;
    const type = this.getValidatedType(parameter);

    if (!this.supportsBodyParameters(this.method)) {
      throw new Error(`Body can't support '${this.getCurrentLocation()}' method.`);
    }

    return {
      description: this.getParameterDescription(parameter),
      in: 'body-prop',
      name: getDecoratorTextValue(this.parameter, ident => ident.text === 'BodyProp') || parameterName,
      required: !parameter.questionToken,
      type: type,
      parameterName
    };
  }

  private getBodyParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text;
    const type = this.getValidatedType(parameter);

    if (!this.supportsBodyParameters(this.method)) {
      throw new Error(`Body can't support ${this.method} method`);
    }

    return {
      description: this.getParameterDescription(parameter),
      in: 'body',
      name: parameterName,
      required: !parameter.questionToken,
      type,
      parameterName
    };
  }

  private getHeaderParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text;
    const type = this.getValidatedType(parameter);

    if (!this.supportPathDataType(type)) {
      throw new InvalidParameterException(`Parameter '${parameterName}' can't be passed as a header parameter in '${this.getCurrentLocation()}'.`);
    }

    return {
      description: this.getParameterDescription(parameter),
      in: 'header',
      name: getDecoratorTextValue(this.parameter, ident => ident.text === 'Header') || parameterName,
      required: !parameter.questionToken,
      type,
      parameterName
    };
  }

  private getQueryParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text;
    const type = this.getValidatedType(parameter);

    if (!this.supportPathDataType(type)) {
      throw new InvalidParameterException(`Parameter '${parameterName}' can't be passed as a query parameter in '${this.getCurrentLocation()}'.`);
    }

    return {
      description: this.getParameterDescription(parameter),
      in: 'query',
      name: getDecoratorTextValue(this.parameter, ident => ident.text === 'Query') || parameterName,
      required: !parameter.questionToken,
      type,
      parameterName
    };
  }

  private getPathParameter(parameter: ts.ParameterDeclaration): Parameter {
    const parameterName = (parameter.name as ts.Identifier).text;
    const type = this.getValidatedType(parameter);
    const pathName = getDecoratorTextValue(this.parameter, ident => ident.text === 'Path') || parameterName;

    if (!this.supportPathDataType(type)) {
      throw new InvalidParameterException(`Parameter '${parameterName}:${type}' can't be passed as a path parameter in '${this.getCurrentLocation()}'.`);
    }
    if (!this.path.includes(`${pathName}`)) {
      throw new Error(`Parameter '${parameterName}' can't macth in path: '${this.path}'`);
    }

    return {
      description: this.getParameterDescription(parameter),
      in: 'path',
      name: pathName,
      required: true,
      type,
      parameterName
    };
  }

  private getParameterDescription(node: ts.ParameterDeclaration) {
    const symbol = MetadataGenerator.current.typeChecker.getSymbolAtLocation(node.name);

    const comments = symbol.getDocumentationComment();
    if (comments.length) { return ts.displayPartsToString(comments); }

    return '';
  }

  private supportsBodyParameters(method: string) {
    return ['post', 'put', 'patch'].some(m => m === method.toLowerCase());
  }

  private supportParameterDecorator(decoratorName: string) {
    return this.decoratorsSchema.parameterDecorators.map( d => d.name.toLocaleLowerCase() ).some(d => d === decoratorName.toLocaleLowerCase());
  }

  private supportPathDataType(parameterType: Type) {
    return ['string', 'integer', 'long', 'float', 'double', 'date', 'datetime', 'buffer', 'boolean', 'enum'].find(t => t === parameterType.typeName);
  }

  private getValidatedType(parameter: ts.ParameterDeclaration) {
    if (!parameter.type) {
      throw new Error(`Parameter ${parameter.name} doesn't have a valid type assigned in '${this.getCurrentLocation()}'.`);
    }
    return ResolveType(parameter.type);
  }
}

class InvalidParameterException extends Error { }
