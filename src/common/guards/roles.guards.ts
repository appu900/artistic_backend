import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector:Reflector){}
    canActivate(context: ExecutionContext):boolean{
        const requiredRoles = this.reflector.get<string[]>('roles',context.getHandler())
        if(!requiredRoles || requiredRoles.length === 0) return true;
        const req = context.switchToHttp().getRequest();
        const user = req.user;
        if(!user) return false;
        return requiredRoles.includes(user.role)
    }
}